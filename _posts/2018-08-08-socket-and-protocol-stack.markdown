---
layout: post
title:  "LINUX 网络协议栈 - SOCKET基本概念"
categories: linux
author: 拾贝
catalog: true
tags:  
    - socket 
    - linux
---

# 概述
TCP/IP协议族包括运输层、网络层、链路层，而socket所在位置，如图，Socket是应用层与TCP/IP协议族通信的中间软件抽象层。

![](/img/socket/01.png 'x')

Unix/Linux基本哲学之一就是“一切皆文件”，都可以用“打开open –> 读写write/read –> 关闭close”模式来操作。

![](/img/socket/02.png 'x')

# socket
int socket(int domain, int type, int protocol); 

creates an endpoint for communication and returns a descriptor.
The  domain  argument  specifies  a  communication  domain;  this  selects  the  protocol family which will be used for communication.

## domain

### AF_UNIX, AF_LOCAL 本地通信

典型的本地IPC，类似于管道，依赖路径名标识发送方和接收方。即发送数据时，指定接收方绑定的路径名，操作系统根据该路径名可以直接找到对应的接收方，并将原始数据直接拷贝到接收方的内核缓冲区中，并上报给接收方进程进行处理。同样的接收方可以从收到的数据包中获取到发送方的路径名，并通过此路径名向其发送数据。

![](/img/socket/03.png 'x')

### AF_INET IPV4网络协议

发送方通过系统调用send()将原始数据发送到操作系统内核缓冲区中。内核缓冲区从上到下依次经过TCP层、IP层、链路层的编码，分别添加对应的头部信息，经过网卡将一个数据包发送到网络中。经过网络路由到接收方的网卡。网卡通过系统中断将数据包通知到接收方的操作系统，再沿着发送方编码的反方向进行解码，即依次经过链路层、IP层、TCP层去除头部、检查校验等，最终将原始数据上报到接收方进程。

![](/img/socket/04.png 'x')

### AF_NETLINK 用户态内核态接口‘设备’

Netlink 是一种在内核与用户应用间进行双向数据传输的非常好的方式，用户态应用使用标准的 socket API 就可以使用 netlink 提供的强大功能，内核态需要使用专门的内核 API 来使用 netlink。

Netlink 相对于系统调用，ioctl 以及 /proc 文件系统而言具有以下优点：

- 为了使用 netlink，用户仅需要在 include/linux/netlink.h 中增加一个新类型的 netlink 协议定义即可， 如 #define NETLINK_MYTEST 17 然后，内核和用户态应用就可以立即通过 socket API 使用该 netlink 协议类型进行数据交换。但系统调用需要增加新的系统调用，ioctl 则需要增加设备或文件， 那需要不少代码，proc 文件系统则需要在 /proc 下添加新的文件或目录，那将使本来就混乱的 /proc 更加混乱。

- netlink是一种异步通信机制，在内核与用户态应用之间传递的消息保存在socket缓存队列中，发送消息只是把消息保存在接收者的socket的接 收队列，而不需要等待接收者收到消息，但系统调用与 ioctl 则是同步通信机制，如果传递的数据太长，将影响调度粒度。

- 使用 netlink 的内核部分可以采用模块的方式实现，使用 netlink 的应用部分和内核部分没有编译时依赖，但系统调用就有依赖，而且新的系统调用的实现必须静态地连接到内核中，它无法在模块中实现，使用新系统调用的应用在编译时需要依赖内核。

- netlink 支持多播，内核模块或应用可以把消息多播给一个netlink组，属于该neilink 组的任何内核模块或应用都能接收到该消息，内核事件向用户态的通知机制就使用了这一特性，任何对内核事件感兴趣的应用都能收到该子系统发送的内核事件，在 后面的文章中将介绍这一机制的使用。

- 内核可以使用 netlink 首先发起会话，但系统调用和 ioctl 只能由用户应用发起调用。

- netlink 使用标准的 socket API，因此很容易使用，但系统调用和 ioctl则需要专门的培训才能使用

### AF_PACKET

允许用户在用户态自定义报文头，此域下的protocol可选以太网协议的ETH_P_IP(0x8000)、arp的ETH_P_ARP(0x0806)和IEEE 802.1Q VLAN tags的ETH_P_8021Q(0x8100)等，ETH_P_ALL允许任何在没有使用多个套接字的情况下接受所有以太网类型的报文

type可选：SOCK_DGRAM（报文从驱动上送时去掉了以太头，用户发报文时不用填写以太头）；SOCK_RAW（报文从驱动上送时是整个报文，包含以太头，用户发报文时也应该是整个报文）。

## type

- SOCK_STREAM ： 提供有序，可靠，双向，基于连接的字节流。 可以支持带外数据传输机制
- SOCK_DGRAM ： 无连接的、不可靠的、固定长度的数据报
- SOCK_SEQPACKET ：有序的，可靠的，双向的，长度固定的数据报。消费者应一次读取一个报文
- SOCK_RAW：原始协议栈访问
- SOCK_NONBLOCK：给新建的文件描述符设置O_NONBLOCK状态标识，与使用fcntl函数的效果一致
- SOCK_CLOEXEC：给新建的文件描述符设置FD_CLOEXEC标识

SOCK_STREAM类型的套接字属于全双工的字节流，类似于管道。不保留记录边界。在收发数据之前，套接字应该是已连接的。使用connect与另一个套接字建立连接。连接建立后，可以使用read/write或者send/recv传输数据。执行close后，连接断开。带外数据的传输在send/recv中描述。


实现SOCK_STREAM通信协议需要保证数据不丢失也不冗余。如果一段数据在合理的时间内无法成功传输，则认为连接已死。当在套接字上启用SO_KEEPALIVE时，如果另一端仍然存在，协议将以协议特定的方式进行检查。如果进程在发送或接收时碰到断掉的流，则引发SIGPIPE信号; 这会导致没有处理此信号的进程退出。SOCK_SEQPACKET套接字使用与SOCK_STREAM套接字相同的系统调用。 唯一的区别是read（2）调用将仅返回请求的数据（想取10个，则取到10个，多余的被丢弃），并且将丢弃到达数据包中剩余的任何数据。 此外，还保留了传入数据报中的所有消息边界。


使用fcntl(2) F_SETOWN来指定进程或进程组在收到带外数据时接收SIGURG信号，或者当SOCK_STREAM连接意外断开后接收SIGPIPE信号。还可以通过SIGIO接收IO或异步消息。使用F_SETOWN相当于使用ioctl（2）设置FIOSETOWN或SIOCSPGRP。

## protocol

常用的协议有，IPPROTO_TCP、IPPTOTO_UDP、IPPROTO_SCTP、IPPROTO_TIPC等，它们分别对应TCP传输协议、UDP传输协议、STCP传输协议、TIPC传输协议。

SCTP:SCTP是一个面向连接的流传输协议，它可以在两个端点之间提供稳定、有序的数据传递服务。SCTP可以看做是TCP协议的改进，它继承了TCP较为完善的拥塞控制并改进TCP的一些不足之处.通信语义可以设置成数据流传输：SOCK_STREAM，也可以设置成有序报文：SOCK_SEQPACKET.

TIPC:爱立信公司提出的一种透明进程间通信协议, 主要适用于高可用(HAL)和动态集群环境。


# 其他

## O_NONBLOCK

### block

- read：在有数据时返回，在没有数据时等待
- write：在有足够的缓冲区存放数据时返回，不够则等待

### non-block

- read：在没有数据时返回-1
- write：在缓冲区不够的情况下，返回能够缓存的字节数

## FD_CLOEXEC

用于表示fork的子进程在执行exec之前，将fd关闭（关闭文件描述符即不能对文件描述符指向的文件进行任何操作）

## F_SETOWN

指定进程或进程组在收到带外数据时接收SIGURG信号，或者当SOCK_STREAM连接意外断开后接收SIGPIPE信号。还可以通过SIGIO接收IO或异步消息

## 遗留问题

- 如何更好的理解domain, type, protocol的对应关系
- 学习AF_PACKET的使用方法
- 深入学习AF_NETLINK
- 了解IPPROTO_TIPC



