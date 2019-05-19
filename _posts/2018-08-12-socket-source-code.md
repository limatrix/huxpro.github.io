---
layout: post
title:  "LINUX网络协议栈 - SOCKET源码分析"
categories: linux
author: 拾贝
catalog: true
tags:  
    - socket 
    - linux
---

# socket函数流程图

![](/img/socket/05.png 'x')

# 流程图说明

- 在用户态调用socket()，系统调用内核入口为sys_socketcall，再调用sys_socket，此函数为SYSCALL_DEFINE3(socket, int, family, int, type, int, protocol)

- func 1 初始化struct socket结构

- func 2 为最终分配struct socket的函数。 搜索super_operations，会在Socket.c文件中找到全局变量sockfs_ops，其中alloc_inode指向sock_alloc_inode。此函数负责从高速缓冲区里申请struct socket_alloc，此结构包含struct socket和struct inode，而返回的却是inode

- func 3 负责根据inode的指针获取socket的指针，通过宏container_of来实现

- func 4 调用与域(用户态socket函数的第一个参数domain)相关的创建函数inet_create。 每个domain都有一个struct net_proto_family结构用于挂接本模块的create函数

- procedure 1 找到正确的struct inet_protosw，将struct proto_ops挂接给socket->ops 即 socket->ops = inet_stream_ops

- func 5 申请struct sock, sk->sk_prot = sk->sk_prot_creator = prot 即 tcp_prot，结构体为struct proto

- func 6 调用sk->sk_prot->init 即 tcp_v4_init_sock 初始化struct tcp_sock

- func 7 关联文件系统，并返回文件描述符fd

- tcp_sock 包含 inet_connection_sock 包含 inet_sock 包含 sock，也就是说分配sock时其实分配的是tcp_sock，这几个结构在内存中的偏移都是0，所以可以直接类型转换

- 从用户态socket函数的参数和内核态的代码结构来看
domain   对应struct net_proto_family，指向此种类型的socket模块的总入口
type     对应struct proto_ops, 不同类型的socket的connect, bind, sendmsg, recvmsg是不同的
protocol 对应struct proto, 最终的协议的处理函数，前面两个参数如果没有，代码也能写，但是没有扩展性，没有层次性

# 其他函数

- bind() -> sys_bind() -> sock->ops->bind()/inet_bind() 给socket绑定指定的地址

- listen() -> sys_listen() -> sock->ops->listen()/inet_listen() listen 函数把一个未连接的套接字转换为一个被动套接字，指示内核应接受指向该套接字的连接请求，其内部实现归根到底就是设置 sock 结构的状态，设置其为 TCP_LISTEN

- connect() -> sys_connect() -> sock->ops->connect()/inet_stream_connect() -> tcp_v4_connect() -> tcp_connect() 初始化TCP连接，发送SYN

- accept() -> sys_accept() -> sys_accept4()
    - -> sock_alloc() -> sock_alloc_fd() -> sock_attach_fd() 再申请一个socket并绑定fd
    
    - -> sock->ops->accept()/inet_accept() -> sk1->sk_prot->accept()/inet_csk_accept() 此函数涉及更深的流程，有机会再分析

