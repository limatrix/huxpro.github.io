1 为什么需要下半部

我们希望尽量减少中断处理程序中需要完成的工作量，因为它在运行的时候，当前的中断线在所有处理器上都会被屏蔽。如果一个处理程序是IRQF_DISABLED类型，它执行的时候会禁止所有本地中断。缩短中断被屏蔽的时间对系统的响应能力和性能都至关重要。

2 什么是软中断

软中断是利用硬件中断的概念，用软件方式进行模拟，实现宏观上的异步执行效果。软中断是和硬中断相对应的，硬中断是外部设备对CPU的中断，软中断是硬件中断服务程序对内核的中断。

3 软中断的实现

软中断是在编译期间静态分配的，最多支持32个软中断

一个软中断不会抢占另一个软中断. 实际上唯一可以抢占软中断的是中断处理程序.不过,其他的软中断可以在其他处理器上同时执行

3.1 软中断执行的时机

3.1.1 从一个硬件中断代码返回时

`
unsigned int __irq_entry do_IRQ(struct pt_regs *regs)
{
	struct pt_regs *old_regs = set_irq_regs(regs);
	/* high bit used in ret_from_ code  */
	unsigned vector = ~regs->orig_ax;
	unsigned irq;
	irq_enter();
	exit_idle();
	irq = __this_cpu_read(vector_irq[vector]);
	if (!handle_irq(irq, regs)) {
		ack_APIC_irq();
	}
	irq_exit();
	set_irq_regs(old_regs);
	return 1;
}
void irq_exit(void)
{
	local_irq_disable();
	account_irq_exit_time(current);
	trace_hardirq_exit();
	sub_preempt_count(HARDIRQ_OFFSET);
	if (!in_interrupt() && local_softirq_pending())
		invoke_softirq();
	tick_irq_exit();
	rcu_irq_exit();
}
`

invoke_softirq必须满足两个条件才能被调用到：不是在中断处理中，包括硬件中断和软件中断；第二个就是必须有软件中断处于pending状态。
因为中断可以嵌套，所以函数进来后先调用sub_preempt_count，减去一层中断，然后判断还是不是在中断中，只有不处于中断，才能调用invoke_softirq。系统这么设计是为了避免软件中断在中断嵌套中被调用，并且达到在单个CPU上软件中断不能被重入的目的。

```
asmlinkage void __do_softirq(void)
{
	struct softirq_action *h;
	__u32 pending;
	unsigned long end = jiffies + MAX_SOFTIRQ_TIME;
	int cpu;
	unsigned long old_flags = current->flags;
	int max_restart = MAX_SOFTIRQ_RESTART;

	/*
	 * Mask out PF_MEMALLOC s current task context is borrowed for the
	 * softirq. A softirq handled such as network RX might set PF_MEMALLOC
	 * again if the socket is related to swap
	 */
	current->flags &= ~PF_MEMALLOC;

	pending = local_softirq_pending();
	account_irq_enter_time(current);

	__local_bh_disable((unsigned long)__builtin_return_address(0),
				SOFTIRQ_OFFSET);
	lockdep_softirq_enter();

	cpu = smp_processor_id();
restart:
	/* Reset the pending bitmask before enabling irqs */
	set_softirq_pending(0);

	local_irq_enable();

	h = softirq_vec;

	do {
		if (pending & 1) {
			unsigned int vec_nr = h - softirq_vec;
			int prev_count = preempt_count();

			kstat_incr_softirqs_this_cpu(vec_nr);

			trace_softirq_entry(vec_nr);
			h->action(h);
			trace_softirq_exit(vec_nr);
			if (unlikely(prev_count != preempt_count())) {
				printk(KERN_ERR "huh, entered softirq %u %s %p"
				       "with preempt_count %08x,"
				       " exited with %08x?\n", vec_nr,
				       softirq_to_name[vec_nr], h->action,
				       prev_count, preempt_count());
				preempt_count() = prev_count;
			}

			rcu_bh_qs(cpu);
		}
		h++;
		pending >>= 1;
	} while (pending);

	local_irq_disable();

	pending = local_softirq_pending();
	if (pending) {
		if (time_before(jiffies, end) && !need_resched() &&
		    --max_restart)
			goto restart;

		wakeup_softirqd();
	}

	lockdep_softirq_exit();

	account_irq_exit_time(current);
	__local_bh_enable(SOFTIRQ_OFFSET);
	tsk_restore_flags(current, old_flags, PF_MEMALLOC);
}
```

- 用局部变量pending保存local_softirq_pending()宏的返回值. 它是待处理的软中断的32位位图 -- 如果第n位被设置为1，那么第n位对应类型的软中断等待处理
- 调用__local_bh_disable关闭软中断，其实就是设置正在处理软件中断标记，在同一个CPU上使得不能重入__do_softirq函数
- 重新设置软中断标记为0，set_softirq_pending重新设置软中断标记为0，这样在之后重新开启中断之后硬件中断中又可以设置软件中断位。
- 开启硬件中断
- 之后在一个循环中，遍历pending标志的每一位，如果这一位设置就会调用软件中断的处理函数。在这个过程中硬件中断是开启的，随时可以打断软件中断。这样保证硬件中断不会丢失。
-  之后关闭硬件中断，查看是否又有软件中断处于pending状态，如果是，并且在本次调用__do_softirq函数过程中没有累计重复进入软件中断处理的次数超过10次，就可以重新调用软件中断处理。如果超过了10次，就调用wakeup_softirqd();唤醒内核的一个进程来处理软件中断。设立10次的限制，也是为了避免影响系统响应时间。

3.1.2 在ksoftirqd内核线程中

```
if (pending) {
		if (time_before(jiffies, end) && !need_resched() &&
		    --max_restart)
			goto restart;

		wakeup_softirqd();
	}
```

在完成了pending的循环后，再关闭本地中断（执行软中断时是打开了本地中断的，防止大量丢失硬件中断，即软中断是可以被硬件中断打断的）。再次获取pending，如果有被设置的软中断。判断软中断的执行时常是否到了默认值，是否该执行schedule(), 并且最多只允许进入10次while循环。如果时间和次数都没到达最大值，并且不需要调度，则可以继续执行while循环。否则调用wakeup_softirqd唤醒ksoftirqd进程。

```
static void run_ksoftirqd(unsigned int cpu)
{
	local_irq_disable();
	if (local_softirq_pending()) {
		__do_softirq();
		local_irq_enable();
		cond_resched();

		preempt_disable();
		rcu_note_context_switch(cpu);
		preempt_enable();

		return;
	}
	local_irq_enable();
}
```

每次执行完__do_softirq都调用cond_resched，尽量不影响其他进程的执行。

-- 其他
软中断保留给系统中对时间要求最严格以及最重要的下半部使用。内核定时器和tasklet都是建立在软中断上的
软中断处理程序执行的时候，允许响应中断，但它自己不能休眠。在一个处理程序运行的时候，当前处理器上的软中断被禁止。但其他的处理器仍可以执行别的软中断。实际上，如果同一个软中断在它被执行的同时再次被触发了，那么另一个处理器可以同时运行其处理程序。这意味着需要锁保护
因此，大部分软中断处理程序，都通过采取单处理器数据（仅属于某一个处理器的数据，因此根本不需要加锁）或其他一些技巧来避免显式的加锁，从而提供更出色的性能
tasklet本质也是软中断，只不过同一个处理程序的多个实例不能在多个处理器上同时运行
在中断处理程序中触发软中断是最常见的形式
一个软中断不会抢占另一个软中断，只有中断处理程序可以抢占软中断，其他的软中断可以在其他处理器上执行
in_interrupt()是判断当前进程是否处于中断上下文，这个中断上下文包括底半部和硬件中断处理过程
利用preempt_count可以表示是否处于中断处理或者软件中断处理过程中
preempt_count的8～23位记录中断处理和软件中断处理过程的计数。如果有计数，表示系统在硬件中断或者软件中断处理过程中。系统这么设计是为了避免软件中断在中断嵌套中被调用，并且达到在单个CPU上软件中断不能被重入的目的
之前我说到不能让CPU长时间来处理中断事务，这样会影响系统的响应时间，严重影响用户和系统之间的交互式体验。所以在之前的__do_softirq中最多将循环执行10次，那么当执行了10次仍然有软中断在pending状态，这个时候应该怎么处理呢？系统将唤醒一个软件中断处理的内核进程，在内核进程中处理pending中的软件中断。这里要注意，之前我们分析的触发软件中断的位置其实是中断上下文中，而在软中断的内核线程中实际已经是进程的上下文。

- tasklet

tasklet是利用软中断实现的一种下半部机制。它和进程没有任何关系。它和软中断在本质上很相似，行为表现也很相近，但是，它的接口更简单，锁保护也要求低。

tasklet由两类软中断代表：HI_SOFTIRQ和TASKLET_SOFTIRQ，HI_SOFTIRQ类型的软中断优先于TASKLET_SOFTIRQ类型的软中断执行。

一种特定类型的tasklet只能运行在一个CPU上，不能并行

多个不同类型的tasklet可以并行在多个CPU上。 

通过显式的调用tasklet_schedule()函数来触发tasklet执行。比如，802.11的接收中断处理函数ieee80211_rx_irqsafe中调用tasklet_schedule。

```
static inline void tasklet_schedule(struct tasklet_struct *t)
{
	if (!test_and_set_bit(TASKLET_STATE_SCHED, &t->state))
		__tasklet_schedule(t);
}
```
如果tasklet的状态不是TASKLET_STATE_SCHED，才会被调度
```
void __tasklet_schedule(struct tasklet_struct *t)
{
	unsigned long flags;

	local_irq_save(flags);
	t->next = NULL;
	*__this_cpu_read(tasklet_vec.tail) = t;
	__this_cpu_write(tasklet_vec.tail, &(t->next));
	raise_softirq_irqoff(TASKLET_SOFTIRQ);
	local_irq_restore(flags);
}
```
将tasklet加入低优先级队列，触发软中断，进而调用wakeup_softirqd()
```
static void tasklet_action(struct softirq_action *a)
{
	struct tasklet_struct *list;

	local_irq_disable();
	list = __this_cpu_read(tasklet_vec.head);
	__this_cpu_write(tasklet_vec.head, NULL);
	__this_cpu_write(tasklet_vec.tail, &__get_cpu_var(tasklet_vec).head);
	local_irq_enable();

	while (list) {
		struct tasklet_struct *t = list;

		list = list->next;

		if (tasklet_trylock(t)) {
			if (!atomic_read(&t->count)) {
				if (!test_and_clear_bit(TASKLET_STATE_SCHED, &t->state))
					BUG();
				t->func(t->data);
				tasklet_unlock(t);
				continue;
			}
			tasklet_unlock(t);
		}

		local_irq_disable();
		t->next = NULL;
		*__this_cpu_read(tasklet_vec.tail) = t;
		__this_cpu_write(tasklet_vec.tail, &(t->next));
		__raise_softirq_irqoff(TASKLET_SOFTIRQ);
		local_irq_enable();
	}
}
```

- 循环遍历链表上的每一个待处理的tasklet
- 如果是多处理器系统，通过检查TASKLET_STATE_RUN来判断这个tasklet是否在其他处理器上运行。如果它正在运行，那么现在就不要执行，跳到下一个待处理的tasklet上去
- 如果当前这个tasklet没有执行，将其状态设置为TASKLET_STATE_RUN，这样，别的处理器就不会再去执行它了
- 检查count值是否为0，确保tasklet没有被禁止，如果tasklet被禁止了，则跳到下一个tasklet上去

softirq和tasklet的区别，在于允不允许在不同的处理器上能不能同时执行同一个处理程序

- 工作队列

工作队列是另外一种将工作推后执行的形式，它和我们前面讨论的所有其他形式都不相同。工作队列总是把工作交给一个内核线程去执行。这样，通过工作队列执行的代码能占尽进程上下文的所有优势。最重要的就是工作队列允许重新调度甚至睡眠。








