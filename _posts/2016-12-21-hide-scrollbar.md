---
layout: post
title:  "HTML如何隐藏滚动条"
categories: html
author: 拾贝
catalog: true
tags:  
    - html 
    - scrollbar
---

## 1 如何显示滚动条
   
  需要给容器设置overflow属性. 如果不设置overflow属性, 就不会显示滚动条, 超出的内容会被显示, 容器的实际高度不变, 如果此容器下面还有内容, 则会与超出的部分重叠显示

   ``` html
   <div style="width:400px; height:400px; overflow:auto"></div>
   ```

## 2 overflow的属性值
    
- visible: 默认值, 内容不会被修剪, 会呈现在元素框之外, 和上面说的没有overflow属性是一样的
- hidden : 内容会被修剪, 但多余内容不可见, 没有滚动条
- scroll : 横竖滚动条默认都会显示. 如果内容没有超出, 只显示滚动条的底, 如果超出再显示滚动条
- auto   : 内容超出后才会显示滚动条
- inherit: 从父元素继承overflow属性的值


## 3 如何隐藏滚动条并且功能正常

### 3.1 将overflow设置为auto, 将滚动条设置为透明或者页面颜色

- 在网上搜索 **滚动条颜色设置** , 搜出来的结果都是这个 **scrollbar-face-color: #FFFFFF**, 经测试只对IE有效
- 然后再搜 **滚动条 webkit**, 搜出来 **-webkit-scrollbar-thumb** 这一类样式, 只对chrome有效
- 再搜 **滚动条 firefox css** 和 **滚动条 moz css**均没搜到有用的结果
- 搜索 **scrollbar moz css**, 搜到了这篇博客 **http://codemug.com/html/custom-scrollbars-using-css/**. 和我之前搜到的内容一样, 但比较详细. IE和chrome有自己的设置, firefox不支持

**无法采用这种方式**

### 3.2 将滚动条覆盖

使用两个DIV, 外侧DIV比内侧DIV窄一点, 将内侧的滚动条覆盖住

``` html
<div style="width:380px; height:400px; overflow:hidden">
    <div style="width:400px; height:400px; padding-right:20px; overflow:auto;">
    </div>
</div>
```

**这种方法简单, 没觉得有什么不好, 可以考虑使用**

### 3.3 使用插件

我选择的是perfect-scrollbar, 比较轻量级, 但不能初始化时设置不显示滚动条(有的插件是可以的). https://github.com/noraesae/perfect-scrollbar

#### 3.3.1 使用方法
``` html
<script src="jquery.min.js"></script>
<link href="perfect-scrollbar.min.css" rel="stylesheet">
<script src="perfect-scrollbar.jquery.min.js"></script>
```
``` html
<div style="width:400px; height:400px; overflow:hidden; position:relative;" id="container">
</div>
```
``` javascript
$(document).ready(function(){
    $('#container').perfectScrollbar();
});
```

如果内容高于此DIV, 鼠标经过右边框时会显示滚动条

#### 3.3.2 如何隐藏滚动条

- 把perfect-scrollbar.min.css引用删掉
  确实不显示滚动条, 而且内容可以滚动, 但又滚动的太多了, 内容可以滚出当前DIV

- 没有参数可供初始化时隐藏掉滚动条

- 定义自己的样式
  文档里说可以定义自己的样式, 但用到了sass, 不了解这个, 目前也不想深究

- 覆盖掉滚动条的样式, 经验证, 把滚动条的底和滚动条本身的宽度都设置为0比较简单
    ``` css
    .ps-container>.ps-scrollbar-y-rail {
        width:0px;
    }
    .ps-container>.ps-scrollbar-y-rail>.ps-scrollbar-y {
        width:0px;
    }
    .ps-container>.ps-scrollbar-y-rail:hover>.ps-scrollbar-y, .ps-container>.ps-scrollbar-y-rail:active>.ps-scrollbar-y{
        width:0px;
    }
    ```

**本节内容完全的实用主义, 对各知识点都没有深究, 各位看看即可**