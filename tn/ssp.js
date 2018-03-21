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
                    this.container.html(page_obj_low.html);
                    this.page_runtime_list.push(page_obj_low)
                    return {deep:page_obj_low.deep, pointer:page_obj_low.pointer};
                }
            }
        }, 

        recovery: function() {
            var page_obj_top = this.page_runtime_list.pop();
            this.container.empty();
            this.container.html(page_obj_top.html);
            this.page_runtime_list.push(page_obj_top)
        }, 

        length: function() {
            return this.page_runtime_list.length;
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
            }
        },
    };

//
var Topic = function() {
    this.cur_object_ptr  = null;
    this.cur_object_deep = 0;
    this.cur_object_seq  = 0;
    this.global_object   = null;
    this.ssp             = null;
    this.start_x         = 0;
    this.end_x           = 0;
    this.save_tag        = 0;
    this.cur_opt_item_id = "";
    this.init();
}

Topic.prototype = {
    init: function() {
        this._init_global_object();
        this._init_ssp();
        this._init_index();
        this._bind_edit_click();
        this._bind_save_click();
        this._bind_item_click();
        this._bind_back_click();
        this._bind_touch();
        this._bind_oper_icon();
    }, 

    _init_global_object: function() {
        this.global_object  = new Object();
        this.global_object.id = 0;
        this.global_object.text = "";
        this.global_object.children = [];
        // 从服务器拿来数据后需要再初始化children
        this._set_cur_obj(this.global_object.children);
    },

    _init_ssp: function() {
        this.ssp = new Ssp($(".main-container"), "topic");
    },

    _init_index: function() {
        this.ssp.go("topic-list", this._get_page_deep(), this._get_cur_obj());
    },

    recovery: function() {
        this.ssp.recovery();
    },

    _bind_edit_click: function() {
        var _this = this;
        $(".topic-edit").click(function(){
            _this.ssp.go("topic-edit")
            _this._show_nav_bar_icon("topic-save");
            _this.save_tag = 1;
        });
    },

    _bind_save_click: function() {
        var _this = this;
        $(".topic-save").click(function(){
            var text = $(".weui-textarea").val();
            var cur_obj = _this._get_cur_obj();
            if(_this.save_tag == 1) { //新增
                if("" != text) {
                    var obj = new Object();
                    obj.id = _this._get_new_id();
                    obj.text = text;
                    obj.children = [];

                    cur_obj.push(obj);
                }
            } else if(_this.save_tag == 2) { //修改
                var obj = _this._get_obj_by_id(_this.cur_opt_item_id);
                obj.text = text;
            } else {
                console.log("this.save_tag error : " + _this.save_tag);
            }
            _this.save_tag = 0;
            _this.ssp.go("topic-list", _this._get_page_deep(), cur_obj);

            _this._show_nav_bar_icon("topic-edit");
        });
    },

    _bind_item_click: function() {
        var _this = this;
        $(document).on("click", ".topic-item", function(){
            var id = $(this).attr("id");
            var obj = _this._get_obj_by_id(id);
            if(obj) {
                _this._incr_page_deep();
                _this._set_cur_obj(obj.children);
                _this.ssp.go("topic-list", _this._get_page_deep(), _this._get_cur_obj());
            } else {
                console.log("index page, get topic failed")
            }
        });
    },

    _bind_back_click: function() {
        var _this = this;
        $(".history-back").click(function(){
            var obj = _this.ssp.back();
            if(obj) {
                _this._set_page_deep(obj.deep);
                _this._set_cur_obj(obj.pointer);
            }
            
        });
    },

    _bind_touch: function() {
        var _this = this;
        $(document).on("touchstart", ".topic-item", function(event){
            var o_event = event.originalEvent;
            var touch = o_event.changedTouches[0];
            _this.start_x = touch.pageX;
            _this.cur_opt_item_id = $(event.currentTarget).attr("id");
        });

        $(document).on("touchend", ".topic-item", function(event){
            var o_event = event.originalEvent;
            var touch = o_event.changedTouches[0];
            _this.end_x = touch.pageX;
            var distance = Math.abs(_this.end_x - _this.start_x);
            if(distance > 100) {
                var cur = $(event.currentTarget);
                
                var id  = cur.attr("id");
                var offset = cur.offset();
                var height = cur.height();
                var width  = cur.width();
                $("#item-oper").offset({top:offset.top,left:offset.left});
                $("#item-oper").height(height);
                $("#item-oper").width(width);
                $("#item-oper").css("line-height", height + "px");
                $("#item-oper").show();
            }
        });
    },

    _bind_oper_icon: function() {
        var _this = this;
        $(".item-oper_icon.edit").click(function(e){
            $("#item-oper").hide();
            var obj = _this._get_obj_by_id(_this.cur_opt_item_id);
            _this.ssp.go("topic-edit");
            $(".weui-textarea").val(obj.text);
            _this._show_nav_bar_icon("topic-save");
            _this.save_tag = 2;
        });
        $(".item-oper_icon.del").click(function(e){
            $("#item-oper").hide();
            _this._remove_obj_by_id(_this.cur_opt_item_id);
            _this.ssp.go("topic-list", _this._get_page_deep(), _this._get_cur_obj());
        });
        $(".item-oper_icon.return").click(function(e){
            $("#item-oper").hide();
        });
    },

    _show_nav_bar_icon: function(icon) {
        if(icon == "topic-edit")
        {
            $(".topic-save").hide();
            $(".topic-edit").show();
        }
        if(icon == "topic-save")
        {
            $(".topic-edit").hide();
            $(".topic-save").show();
        }
    },

    _set_cur_obj: function (obj) {
        this.cur_object_ptr = obj;
    },

    _get_cur_obj: function () {
        return this.cur_object_ptr;
    },

    _incr_page_deep: function () {
        this.cur_object_deep++;
    },

    _set_page_deep: function (deep) {
        this.cur_object_deep = deep;
    },

    _get_page_deep: function () {
        return this.cur_object_deep;
    },

    _get_new_id: function () {
        var d = new Date();
        return "" + d.getTime();
    },

    _get_obj_by_id: function (id) {
        var lst = this._get_cur_obj();
        var obj = null;
        for (var i = 0; i < lst.length; i++) {
            obj = lst[i];
            if(obj.id == id) {
                break;
            }
        }
        return obj;
    },

    _remove_obj_by_id: function(id) {
        var lst = this._get_cur_obj();
        var obj = null;
        for (var i = 0; i < lst.length; i++) {
            obj = lst[i];
            if(obj.id == id) {
                break;
            }
        }
        if(i < lst.length) {
            lst.splice(i, 1);
        }
    },
}

var Classify = function() {
    this.ssp = null;
    this.init();
};

Classify.prototype = {
    init: function() {
        this._init_ssp();
        this._bind_item_click();
    },

    _init_ssp: function() {
        this.ssp = new Ssp($(".main-container"), "classify");
    },

    recovery: function() {
        if(0 == this.ssp.length()) {
            this.ssp.go("classify-list", 0);
        } else {
            this.ssp.recovery();
        }
    },

    _bind_item_click: function() {
        var _this = this;
        $(document).on("click", ".weui-cell.classify-item", function(e){
            var id = $(e.currentTarget).attr("id");
            _this.ssp.go("classify-class", 1);
        });
    },
};