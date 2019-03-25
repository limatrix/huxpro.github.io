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