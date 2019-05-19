---
layout: post
title:  "SSH 隧道学习"
categories: linux
author: 拾贝
catalog: true
tags:  
    - ssh 
    - tunnel
---


## 1 基本概念

- 本地转发/正向连接
- 远程转发/反向连接
- 动态转发/SOCKS代理

## 2 区分标准是什么

SSH的连接是有方向的, 从SSH CLIENT到SSH SERVER. 访问应用的连接也是有方向的, 从应用的CLIENT到应用的SERVER.如果SSH连接和应用连接的方向是一致的, 就叫做正向连接或本地转发. 方向相反则叫做反向连接或远程转发. 

上面的这种说法一开始让人不明白, 下面说一个更乱的:

正向连接是SSH CLIENT连上SSH SERVER, 然后把SERVER能访问的机器的IP和端口映射到CLIENT上, 其中"能访问的机器"可以是SERVER本身

反向连接是SSH CLIENT连上SSH SERVER, 然后把CLIENT能访问的机器的IP和端口映射到SERVER上, 其中"能访问的机器"可以是CLIENT本身

不明白也没问题, 先看下面的实例, 然后再回来.

*写完下面的内容再回来有了新的发现*
*数据流方向与SSH连接方向一致为正向连接, 相反为反向连接*


## 3 能做什么

**正向连接** A能访问B, B能访问C, 但是A不能访问C, 此时A可以通过B作为跳板访问C

**反向连接** 主要用来访问内网服务, 即穿NAT

**SOCKS代理** 通过代理服务器访问网络

## 4 怎么做

### 4.1 正向连接

``` bash
ssh -L [客户端IP或省略]:[客户端端口]:[服务器侧能访问的IP]:[服务器侧能访问的端口] [登陆服务器的用户名@服务器IP] -p [服务器ssh服务端口（默认22）]
```

下面的例子是通过公网服务器去访问其他的服务器, 这里ssh server为阿里云的VPS

> ssh client: 172.27.18.59 <br />
  ssh server: 121.42.186.117 <br />
  app client: 172.27.18.39 <br />
  app server: pop.163.com <br />

``` bash
ssh -L 172.27.18.59:8080:pop.163.com:110 root@121.42.186.117
```

本条命令是在ssh client上执行, 数据方向是app client到ssh client再到ssh server, 与ssh连接方向一致

在app client上访问172.27.18.59 8080

``` bash
C:\>nc 172.27.18.59 8080
+OK Welcome to coremail Mail Pop3 Server (163coms[726cd87d72d896a1ac393507346040fas])
USER xxxxx
+OK core mail
PASS xxxxx
-ERR 您没有权限使用pop3功能
```

连接建立后, ssh client监听8080端口, 并与ssh server 22建立了连接. ssh server上显示的IP为221.12.31.29, 应该是我的出口IP
``` bash
ssh client
tcp        0      0 172.27.18.59:8080       0.0.0.0:*               LISTEN
tcp        0      0 172.27.18.59:51315      121.42.186.117:22       ESTABLISHED

ssh server
tcp        0    324 121.42.186.117:22       221.12.31.29:29146      ESTABLISHED
```

访问172.27.18.59 8080后
``` bash
ssh client
tcp        0      0 172.27.18.59:8080       172.27.18.39:49219      ESTABLISHED

ssh server
tcp        0      0 121.42.186.117:28319    220.181.12.101:110      ESTABLISHED

```
从上面的连接信息可以看出, 在app client上访问ssh client的8080端口, ssh server就会去访问app server. 


**这里有个疑问**

网上举的例子app server都是http服务器, 我实验的时候是不成功的, 配置如下

``` bash
ssh -L 172.27.18.59:8080:www.baidu.com:80 root@121.42.186.117
```

在app client和ssh client上分别用浏览器和wget访问172.27.18.59:8080都不成功, `wget 172.27.18.59:8080 --debug`看到能建立连接, 但是木有数据回来. 但是用nc就可以 (HTTP协议是通过wget的--debug参数获取的)

``` bash
C:\nc 172.27.18.59 8080
GET / HTTP/1.1
User-Agent: Wget/1.15 (linux-gnu)
Accept: */*
Host: www.baidu.com
Connection: Keep-Alive

HTTP/1.1 200 OK
Server: bfe/1.0.8.18
Date: Tue, 27 Sep 2016 08:13:11 GMT
略 ......
```

另外, 上面所说的'其中"能访问的机器"可以是SERVER本身'', 下面的命令就是通过ssh client的8080端口就能登录进ssh server

``` bash
ssh -L 172.27.18.59:8080:121.42.186.117:22 root@121.42.186.117
```

### 4.2 反向连接

``` bash
ssh -R [服务器IP或省略]:[服务器端口]:[客户端侧能访问的IP]:[客户端侧能访问的IP的端口] [登陆服务器的用户名@服务器IP] -p [服务器ssh服务端口（默认22）]
```

下面我们先建一个反向连接. 通过一台公网服务器访问内网PC的HTTP. 

> ssh client: 172.27.18.59 <br />
  ssh server: 121.42.186.117 <br />
  app client: 172.27.18.39 <br />
  app server: 172.27.18.59 <br />

``` bash
ssh -R 121.42.186.117:8080:172.27.18.59:80 root@121.42.186.117
```

本条命令同样是在ssh client上执行的, 但数据的访问方向却是通过app client到ssh server再到ssh client, 与ssh连接方向相反

在app client上通过浏览器访问ssh server的8080端口, 就能访问到HTTP服务, 为什么这样就能访问而正向连接就不行呢???

### 4.3 SOCKS代理

``` bash
ssh -D [本地IP或省略]:[本地端口] [登陆服务器的用户名@服务器IP] -p [服务器ssh服务端口（默认22）]
```

> ssh client: 172.27.18.59 <br />
  ssh server: 121.42.186.117 <br />
  app client: 172.27.18.39 <br />

``` bash
ssh -D 172.27.18.59:8080 root@121.42.186.117
```

在app client上设置代理为172.27.18.59:8080, 设置方法为打开IE, 设置->Internet选项->连接->局域网设置->勾选为LAN使用代理服务器(留空地址和端口)->高级->在套接字栏填上IP和端口. 而不是HTTP代理.Chrome使用的是IE的设置, IE设置好后可直接使用Chrome上网,  然后随意访问一个网站, 在ssh server里能看到很多连接到你的目标网站的tcp连接

## 5 常用参数
- -C 压缩
- -N 表示不执行远程的命令
- -f 后台执行命令
- -g 允许远程主机连接本地转发端口
- -R 表明是将远端主机端口映射到本地端口
- -L 则是将本地端口映射到远端主机端口
- -D 本地动态端口转发


