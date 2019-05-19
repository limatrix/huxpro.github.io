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

# struct pci_device_id 存储配置寄存器中的厂商和设备ID

# sturct pci_diver pci设备probe suspend remove等函数

# pci_register_dirver 注册pci设备

# struct net_device 此结构是网络驱动及接口层中最重要的结构，其中不但描述了接口方面的信息，还包括硬件信息，也使该结构很大很复杂。net_device的成员大致可以分为以下几类

  - 硬件信息：与网络设备相关的底层硬件信息，如果是虚拟网络设备驱动，则这部分信息无效
  - 接口信息：
  - 设备操作接口：主要提供操作数据或控制设备的一些功能，如发送数据包的接口、激活和关闭设备的接口等。

net_device结构中包含了驱动相关的所有信息，按信息的分类又把一些类型的信息组织到其他结构体中，并嵌套在net_device结构中。例如与IPV4相关的配置放在in_device结构体中

# 网络设备的注册

 1. 设备注册的时机：系统初始化时或者设备热插拔时

 2. 分配net_device结构体

    a. alloc_netdev() 网络设备由net_device结构定义，每个net_device结构实例代表一个网络设备，该结构由alloc_netdev分配

      i sizeof_priv 指定用于存储驱动程序参数的私有数据块大小
      ii name 设备名，通常是个前缀，相同前缀的设备会进行统一编号，以确保设备名唯一
      iii setup 配置函数，用于初始化net_device结构实例的部分域，可参见ether_setup函数

# 设备注册状态通知

内核其他模块和用户空间应用程序可能都想知道网络设备注册、注销、打开、关闭的时间，因此提供了两个产生事件通知的途径，即netdev_chain通知链和netlink的RTMGRP_LINK组播组。内核模块只要注册到netdev_chain通知链上，网络设备的相关事件都会通知该模块，而用户空间应用程序只要注册到netlink的RTMGRP_LINK组播组，网络设备的相关事件也会通知到该应用程序

- 内核模块可以通过register_netdevice_notifier()将处理网络设备事件的函数注册到netdev_chain通知链中，之后可以通过unregister_netdevice_notifier()注销。并且可以对一个或多个事件感兴趣

- 当设备状态或配置改变时，通知被发送到连接组播组RTMGRP_LINK。事实上，哪些发送到连接组播组RTMGRP_LINK的通知也是由netdev_chain通知链驱动的

# 网络设备的注销

1. 调用unregister_netdev()完成网络设备的注销

a. 通过dev_close()禁止网络设备
b. 释放所有分配的资源，如IRQ、I/O内存、I/O端口等
c. 从全局队列dev_base、dev_name_head和dev_index_head散列表中移除net_device实例
d. 一旦实例的引用为0，就释放net_device实例、驱动程序私有数据结构及其他连接到它的内存块
e. 移除添加到proc和sys文件系统的任何文件

# 网络设备的启用/禁用

设备一旦注册后即可使用，但必须在用户或用户空间应用程序使能后才可以收发数据，最终调用dev_open()将网络设备从关闭状态转到激活状态。调用dev_close()将网络设备从激活状态转换到关闭状态。

# 虚拟网络设备

虚拟网络设备是建立在一个或多个真实设备之上的抽象设备。虚拟设备与真实设备的对应关系可以是一对一，也可以是多对一或者一对多。



e1000_init_module -> pci_register_driver -> driver_register

driver_find -> kset_find_obj 查找驱动是否已经注册过了

kobject是组成设备模型的一个最底层的核心数据结构，与sysfs文件系统自然的绑定在一起：每个kobject对应sysfs文件系统中一个目录。kobject结构所能处理的任务以及所支持的代码包括：
（1）引用计数；
（2）维持容器的层次列表和组。
（3）为容器的属性提供一种用户态查看的视图。
（4）热插拔事件的处理：当系统中的硬件热插拔时，在kset（其内嵌有kobject）内核对象的控制下，将产生事件以通知用户空间，该结构一般没有单独定义而是嵌入到其他设备结构体中。

kset是同种类型的kobject对象的集合，也可以说是对象的容器，通过kset数据结构可以将kobjects组成一颗层次树。kset的名字保存在内嵌的kobject中。
包含在kset中的所有kobject被组织成一个双向循环链表，list是这个链表的链表头。kset数据结构还内嵌了一个kobject对象（kobj），所有属于这个kset的kobject对象的parent

bus_add_driver 
    kobject_init_and_add 驱动的kobject初始化和添加dir到sysfs中
    driver_attach 最终条用驱动的probe函数
    klist_add_tail 将driver_private添加进链表klist_drivers
    module_add_driver 这个函数的功能就在对应驱动module目录下生成一个名字，这个有bus和驱动的名字组成
    driver_create_file 在sysfs的目录下创建文件uevent属性文件
    driver_add_attrs 给driver添加bus上的所有属性
    add_bind_files

driver_add_groups 如果grop不为空的话，将在驱动文件夹下创建以group名字的子文件夹，然后在子文件夹下添加group的属性文件


1.1. 设备模型

由 总线（bus_type） + 设备（device） + 驱动（device_driver） 组成，在该模型下，所有的设备通过总线连接起来，即使有些设备没有连接到一根物理总线上，linux为其设置了一个内部的、虚拟的platform总线，用以维持总线、驱动、设备的关系。

因此，对于实现一个linux下的设备驱动，可以划分为两大步：

1、设备注册；

2、驱动注册。

Bus（总线）：总线是CPU和一个或多个设备之间信息交互的通道。而为了方便设备模型的抽象，所有的设备都应连接到总线上，无论是CPU内部总线、虚拟的总线还是“platform Bus”（在计算机中有这样一类设备，它们通过各自的设备控制器，直接和CPU连接，CPU可以通过常规的寻址操作访问它们（或者说访问它们的控制器）。这种连接方式，并不属于传统意义上的总线连接。但设备模型应该具备普适性，因此Linux就虚构了一条Platform Bus，供这些设备挂靠。）。

Class（分类）：在Linux设备模型中，Class的概念非常类似面向对象程序设计中的Class（类），它主要是集合具有相似功能或属性的设备，这样就可以抽象出一套可以在多个设备之间共用的数据结构和接口函数。因而从属于相同Class的设备的驱动程序，就不再需要重复定义这些公共资源，直接从Class中继承即可

Device（设备）：抽象系统中所有的硬件设备，描述它的名字、属性、从属的Bus、从属的Class等信息

Device Driver（设备驱动），Linux设备模型用Driver抽象硬件设备的驱动程序，它包含设备初始化、电源管理相关的接口实现。而Linux内核中的驱动开发，基本都围绕该抽象进行（实现所规定的接口函数）

上面提到过，Linux内核通过sys文件系统展示了设备驱动模型的内在结构，我们通过sys文件系统来看看上述抽象如何组织在一起，如何有序的管理linux设备：

