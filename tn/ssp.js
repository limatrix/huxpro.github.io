//
    var Ssp = function(container , group) {
        this.page_template_list = [];
        this.page_runtime_list = [];
        this.container = container;
        this.group = group;
        this.init();
    }

    Ssp.prototype = {
        init: function() {
            var page_template_list = $('script[type="text/html"]');
            for (var i = 0; i < page_template_list.length; i++) {
                var page = $(page_template_list[i]);
                var id   = page.attr("id");
                var html = page.html();

                if(page.attr("group") != this.group) {
                    continue;
                }

                var obj = {
                    "id": id,
                    "html": html
                };

                // 记录回调函数的名字
                obj.callback = page.attr("callback") || null; 
                // 记录页面是否需要生成历史记录
                obj.history  = (page.attr("history") == "true") ? true : false;

                this.page_template_list.push(obj);
            }
        },

        go: function(page_id, deep, params) {
            var page_obj = this.find(page_id);
            if(!page_obj){
                console.log("funtion go: can not find page " + page_id);
            } else {
                this.load_new_page(page_obj, deep, params);
            }
        },

        back: function() {
            var len = this.page_runtime_list.length;
            if( len <= 1) {
                //不动
            } else {
                var page_obj_top = this.page_runtime_list.pop();
                var page_obj_low = this.page_runtime_list.pop();
                if(page_obj_low) {
                    this.container.empty();
                    console.log(page_obj_low);
                    this.container.html(page_obj_low.html);
                    this.page_runtime_list.push(page_obj_low)
                    return {deep:page_obj_low.deep, pointer:page_obj_low.pointer};
                }
            }
        }, 

        recovery: function() {
            var page_obj_top = this.page_runtime_list.pop();
            this.container.empty();
            console.log(page_obj_top);
            this.container.html(page_obj_top.html);
            this.page_runtime_list.push(page_obj_top)
        }, 

        find: function(page_id) {
            for (var i = 0; i < this.page_template_list.length; i++) {
                var page_obj = this.page_template_list[i];
                if (page_obj.id == page_id) {
                    return page_obj;
                }
            }
            return null;
        },

        load_new_page: function(page_obj, deep, params) {
            this.container.empty();
            this.container.html(page_obj.html);
            
            if(page_obj.callback) {
                var params_str = "";
                
                if(undefined != params) {
                   params_str = "(" + JSON.stringify(params) + ")";
                } else {
                    params_str = "()";
                }
                console.log(page_obj.callback + params_str)
                eval(page_obj.callback + params_str);
            }

            // 将页面所有内容保存, 供回退使用
            if(page_obj.history)
            {
                //在某些情况下, 两次访问的是同一个页面, 但不需要都记录历史, 一次就够了
                var temp_obj = this.page_runtime_list.pop();
                if(undefined != temp_obj) {
                    if(temp_obj.deep == deep) {
                        //刷新
                        temp_obj.html = this.container.html();
                        this.page_runtime_list.push(temp_obj);
                    } else {
                        this.page_runtime_list.push(temp_obj);
                        var new_obj = Object();
                        new_obj.deep = deep;
                        new_obj.pointer = params;
                        new_obj.html = this.container.html();
                        this.page_runtime_list.push(new_obj);
                    }
                } else {
                    var new_obj = Object();
                    new_obj.deep = deep;
                    new_obj.pointer = params;
                    new_obj.html = this.container.html();
                    this.page_runtime_list.push(new_obj);
                }
                console.log("run time obj list:\n")
                console.log(this.page_runtime_list);
            }
        },
    };