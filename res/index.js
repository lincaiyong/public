class Event {
    static listeners = {};
    static trace = false;
    static onceListeners = {};

    static _rand() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0,  v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    static onOnce(handler) {
        const name = Event._rand();
        Event.onceListeners[name] = handler;
        return name;
    }

    static emitOnce(name, data) {
        const fun = Event.onceListeners[name];
        if (fun) {
            fun(data);
            delete Event.onceListeners[name];
        }
    }

    static on(name, handler) {
        let arr = this.listeners[name];
        if (!arr) {
            arr = [];
            this.listeners[name] = arr;
        }
        arr.push(handler);
        return () => arr.splice(arr, arr.indexOf(handler), 1);
    }

    static emit(name, data) {
        if (Event.trace) {
            console.log(name);
        }
        const arr = this.listeners[name] || [];
        arr.forEach(fun => fun(data));
    }
}

class Property {
    static id = 0;

    static alloc() {
        return Property.id++;
    }

    constructor(element, name, sources, sourceResolver, computeFunc) {
        this._element = element;
        this._name = name;
        this._value = undefined;
        this._subscribers = [];
        this._sources = Array.from(sources || []);
        this._sourceResolver = sourceResolver;
        this._resolvedSources = [];
        this._computeFunc = computeFunc;
        this._updatedListeners = [];
        this._id = Property.alloc();
    }

    get id() {
        return `${this._id}(${this._element.id}.${this._name})`;
    }

    reset(sources=null, computeFunc=null) {
        webapp.util.assert(sources instanceof Array || sources === null);
        this.unsubscribe();
        this._sources = Array.from(sources || []);
        this.subscribe();
        if (computeFunc) {
            webapp.util.assert(computeFunc instanceof Function);
            this._computeFunc = computeFunc;
        }
    }

    update() {
        for (const source of this._resolvedSources) {
            if (source._value === undefined) {
                return;
            }
        }
        this._element[this._name] = this._computeFunc(this._element);
    }

    subscribe() {
        this._resolvedSources = this._sources.map(source => this._sourceResolver(source));
        this._resolvedSources.forEach(
            source => source?._subscribers.push(this)
        );
    }

    unsubscribe() {
        this._resolvedSources.forEach(
            source => source?._subscribers.splice(source?._subscribers.indexOf(this), 1)
        );
    }

    get value() {
        return this._value;
    }

    set value(val) {
        if (this._value !== val && val !== undefined) {
            this._value = val;
            this._updatedListeners.forEach(fun => fun(val));
            this._subscribers.forEach(sub => sub.update());

            // trace log
            if (webapp.log.level === 'trace') {
                webapp.log.trace(`update: ${this.id} = ${val}`);
                this._subscribers.forEach(sub => webapp.log.trace(`     -> ${this.id}`));
            }
        }
    }

    onUpdated(fun) {
        this._updatedListeners.push(fun);
        return () => this._updatedListeners.splice(this._updatedListeners.indexOf(fun), 1);
    }
}

const _webappUtil = {
    assert(condition, failMsg='') {
        if (!condition) {
            webapp.log.error(failMsg || 'assertion fail');
        }
    },
    debounce(fun, interval) {
        let timer;
        return function () {
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => fun.apply(this, args), interval);
        };
    },
    fetch(url) {
        return new Promise((resolve, reject) => {
            fetch(url)
                .then(resp => resp.text())
                .then(v => resolve(v))
                .catch(err => reject(err));
        });
    },
    _canvasCtx: undefined,
    textWidth(text, font, size = 12) {
        if (text === '') {
            return 0;
        }
        if (!webapp.util._canvasCtx) {
            const canvas = new OffscreenCanvas(1000, 40);
            webapp.util._canvasCtx = canvas.getContext("2d");
        }
        text = `=${text}=`
        const ctx = webapp.util._canvasCtx;
        ctx.font = `${size}px ${font}`;
        const metrics = ctx.measureText(text);
        const actual = Math.abs(metrics.actualBoundingBoxLeft) + Math.abs(metrics.actualBoundingBoxRight);
        const ret = Math.max(metrics.width, actual);
        return ret - 1.104 * size;
    },
};

const _webappEvent = {
    addListener(ref, name, handler) {
        if (handler instanceof Function) {
            webapp.log.trace('add event listener', name);
            ref.addEventListener(name, handler);
            return () => ref.removeEventListener(name, handler);
        }
    },
    onceListener(ref, name, handler) {
        if (handler instanceof Function) {
            webapp.log.trace('add once event listener', name);
            function handlerWrapper(ev) {
                webapp.log.trace('once event listener removed', ref, name);
                handler(ev);
                ref.removeEventListener(name, handlerWrapper);
            }
            ref.addEventListener(name, handlerWrapper);
        }
    }
};

const _webappLog = {
    level: 'debug',
    error() {
        console.error('[ERROR] ', ...arguments);
    },
    info() {
        if (['info', 'debug', 'trace'].indexOf(webapp.log.level) !== -1) {
            console.log('[INFO ] ', ...arguments);
        }
    },
    debug() {
        if (['debug', 'trace'].indexOf(webapp.log.level) !== -1) {
            console.debug('[DEBUG] ', ...arguments);
        }
    },
    trace() {
        if (webapp.log.level === 'trace') {
            console.debug('[TRACE] ', ...arguments);
        }
    },
};

const _webappTheme = {
    grayBorderColor: '#EBECF0',
    grayPaneColor: '#F7F8FA',
    dividerColor: '#C8CCD6',
    buttonColor: '#6C707E',
    buttonBgColor: '',
    buttonActiveBgColor: '#DFE1E4',
    buttonHoverBgColor: '#EBECF0',
    buttonSelectedBgColor: '#3475F0',
    buttonSelectedColor: '#FFFFFF',
    editorLineNoColor: '#AEB3C1',
    editorActiveLineColor: '#F6F8FE',
    editorSelectionColor: '#A6D2FF',
    editorHighlightColor: '#E6E6E6',
    editorBracketHighlightColor: '#93D9D9',
    scrollbarBgColor: '#7f7e80',
    treeFocusSelectedBgColor: '#D5E1FF',
    treeSelectedBgColor: '#DFE1E5',
}

const webapp = {
    model: {
        top: null,
    },
    root: null,
    constant: {
        fontFamilyDefault: '',
    },
    create() {
        webapp.log.info('create app.')
        document.documentElement.style.overflow = 'hidden';

        webapp.util.assert(webapp.model.top);
        Promise.all([]).then(() => {
            webapp.destroy();
            webapp._create();
        });
    },
    destroy() {
        if (webapp.root) {
            webapp.root._destroy();
            webapp.root = null;
        }
    },
    createElement(model, parent) {
        const ele = new model.Component(null, model);
        if (parent instanceof Component || parent instanceof Element) {
            ele._create(parent);
        } else {
            webapp.log.error("invalid argument")
        }
        return ele;
    },
    _autoLayout() {
        const resize = () => [webapp.root.w, webapp.root.h] = [window.innerWidth, window.innerHeight];
        webapp.event.addListener(window, 'resize', webapp.util.debounce(resize, 20));
        resize();
    },
    _create() {
        webapp.root = webapp.createElement(webapp.model.top, document.body);
        webapp._autoLayout();
        webapp.root.v = 1;
        webapp.root._checkLoop();
    },
    removeElement(ele) {
        ele._destroy();
    },
    log: _webappLog,
    util: _webappUtil,
    event: _webappEvent,
    theme: _webappTheme,
};

class Scrollbar {
    constructor(container, vh) {
        this.vertical = vh === 'v';
        this.container = container;
        this.bar = this.vertical ? container.children[1] : container.children[0];
        if (this.vertical) {
            this.bar._properties.y.reset();
            this.bar._properties.h.reset();
        } else {
            this.bar._properties.x.reset();
            this.bar._properties.w.reset();
        }

        const _fade = () => this.active = false;
        this.debouncedFade = webapp.util.debounce(_fade, container.scrollBarFadeTime);

        webapp.util.assert(container instanceof ContainerComponent);
        webapp.util.assert(this.bar instanceof ScrollbarComponent);
    }
    get contentLen() {
        return this.vertical ? this.container.childHeight : this.container.childWidth;
    }
    get containerLen() {
        return this.vertical ? this.container.h : this.container.w;
    }
    get barPos() {
        return this.vertical ? this.bar.y : this.bar.x;
    }
    set barPos(v) {
        this.vertical ? this.bar.y = v : this.bar.x = v;
    }
    get barLen() {
        return this.vertical ? this.bar.h : this.bar.w;
    }
    set barLen(v) {
        this.vertical ? this.bar.h = v : this.bar.w = v;
    }
    get scrollVal() {
        return this.vertical ? this.container.scrollTop : this.container.scrollLeft;
    }
    set scrollVal(v) {
        this.vertical ? this.container.scrollTop = v : this.container.scrollLeft = v;
    }
    set active(v) {
        if (v) {
            this.bar.opacity = 1;
        } else {
            this.bar.opacity = 0;
        }
    }
    get containerRect() {
        const rect = this.container.ref.getBoundingClientRect();
        const min = this.vertical ? rect.top : rect.left;
        const max = this.vertical ? rect.bottom : rect.right;
        return {min, max};
    }
    show(flag) {
        if (flag && this.contentLen > this.containerLen) {
            const { scrollBarMargin, scrollBarMinLength } = this.container;
            this.barLen = Math.max(this.containerLen ** 2 / this.contentLen, scrollBarMinLength);
            this.barPos = (this.containerLen - this.barLen - 2 * scrollBarMargin) * this.scrollVal / (this.contentLen - this.containerLen) + scrollBarMargin;
            this.bar.v = 1;
        } else {
            this.bar.v = 0;
        }
    }
    getEventPos(ev) {
        return this.vertical ? ev.clientY : ev.clientX;
    }
    initDraggable() {
        this.bar.onMouseDown = (_, ev0) => {
            ev0.stopPropagation();
            const prev = {val: this.getEventPos(ev0)};
            const cancelMouseMove = webapp.event.addListener(window, 'mousemove', ev => {
                const evPos = this.getEventPos(ev);
                const {min, max} = this.containerRect;
                if ((evPos < min && prev.val === min) || (evPos > max && prev.val === max)) {
                    return;
                }
                const mouse = Math.min(max, Math.max(evPos, min))
                this.scrollVal = Math.min(this.contentLen - this.containerLen, Math.max(this.scrollVal + (mouse - prev.val) / (this.containerLen / this.contentLen), 0));
                prev.val = mouse;
                this.show(true);
                this.active = true;
            });
            webapp.event.onceListener(window, 'mouseup', () => {
                this.active = false;
                cancelMouseMove();
            });
        };
    }
    handleWheel(ev) {
        if (this.contentLen > this.containerLen) {
            this.active = true;
            const delta = this.vertical ? ev.deltaY : ev.deltaX;
            this.scrollVal= Math.min(this.contentLen - this.containerLen, Math.max(this.scrollVal + delta, 0));
            this.show(true);
            this.debouncedFade();
        }
    }
}

class Component {
    constructor(parent, model) {
        const {properties, staticProperties, children} = model;
        this._properties = {};
        this._staticProperties = {};
        this._parent = parent;
        this._model = model;
        this._id = parent ? `${parent.id}.${model.name}` : model.name;
        this._ref = document.createElement(model.tag);
        this._ref.style.position = model.position;
        this._ref.style.overflow = model.overflow;
        this._ref.style.boxSizing = 'border-box';
        this._children = children.map(childData => new childData.Component(this, childData));

        this._sideEffects = {};

        // initialize properties
        const props = Object.assign(this._defaultProperties, properties);
        for (const k in props) {
            const v = props[k];
            webapp.util.assert(v instanceof Array && v.length === 2 && v[0] instanceof Function && v[1] instanceof Array, `invalid argument ${v}`);
            const [computeFunc, sources] = v;
            const sourceResolver = source => this._(source);
            this._properties[k] = new Property(this, k, sources, sourceResolver, computeFunc);
            this._properties[k].onUpdated(v => {
                this._defaultOnUpdated(k, v);
                this.onUpdated(k, v);
            });
        }
        for (const k in staticProperties) {
            this[k] = staticProperties[k];
        }
    }

    get parent() { return this._parent; }
    get children() { return this._children; }
    get model() { return this._model; }
    get id() { return this._id; }
    get tag() { return this.model.tag; }
    get ref() { return this._ref; }
    get root() { return [...Array(this.model.depth).keys()].reduce(prev => prev?.parent, this); }

    _defaultOnUpdated(k, v) {
        if (k === 'hovered') {
            this.onHover?.(this, v);
        }
    }

    _createAll(parent) {
        if (parent instanceof Element) {
            parent.appendChild(this.ref);
        } else if (parent instanceof Component) {
            this._parent = parent;
            parent.children.push(this);
            parent.ref.appendChild(this.ref);
        } else {
            webapp.log.error("invalid argument")
        }
        Object.values(this._properties).forEach(p => p.subscribe());
        this.children.forEach(child => child._createAll(this.ref));
    }

    _initAll() {
        Object.values(this._properties).forEach(p => p.update());
        this.children.forEach(child => child._initAll());
        this.onCreated();
    }

    _create(parent) {
        this._createAll(parent);
        this._initAll();
    }

    _unInitAll() {
        this.children.forEach(child => child._unInitAll());
        Object.values(this._sideEffects).forEach(fun => fun?.());
        Object.values(this._properties).forEach(p => p.unsubscribe());
    }

    _destroyAll() {
        this.children.forEach(child => child._destroyAll());
        this.parent?.children.splice(this.parent?.children.indexOf(this), 1);
        this.ref.parentElement.removeChild(this.ref);
    }

    _destroy() {
        this._unInitAll();
        this._destroyAll();
    }

    _checkLoop() {
        const properties = this._collectProperties();
        this._topologicalSort(properties);
    }

    _collectProperties() {
        let ret = Object.values(this._properties);
        this.children.forEach(child => ret = ret.concat(child._collectProperties()));
        return ret;
    }

    _topologicalSort(properties) {
        const visited = {};
        let total = properties.length;
        let count = 0;
        for (;;) {
            for (const prop of properties) {
                if (prop.id in visited) {
                    continue;
                }
                let ok = true;
                for (const source of prop._resolvedSources) {
                    if (!(source.id in visited)) {
                        ok = false;
                        break;
                    }
                }
                if (ok) {
                    visited[prop.id] = true;
                }
            }

            const newCount = Object.keys(visited).length;
            if (total === newCount) {
                break;
            }
            if (count === newCount) {
                const tmp = properties.filter(prop => !(prop.id in visited)).map(prop => `${prop.id}: ${prop._sources.join(', ')}`);
                webapp.log.error("loop detected", '\n\t'+ tmp.join('\n\t'));
                return;
            }
            count = newCount;
        }
    }

    _addSideEffect(on, fun) {
        this._sideEffects[on]?.();
        this._sideEffects[on] = null;
        if (fun instanceof Function) {
            this._sideEffects[on] = fun;
        }
    }

    _(source) {
        webapp.util.assert(typeof(source) === 'string' && this instanceof Component);
        const ret = this._resolve(source);
        webapp.util.assert(ret);
        return ret;
    }

    _resolve(source) {
        if (!source.includes('.')) {
            return this._resolveEle(source);
        }
        const [e, p] = source.split('.', 2);
        const target = this._resolveEle(e);
        return target?._properties[p];
    }

    _resolveEle(name) {
        if (name === '') {
            return this;
        } else if (name === 'this') {
            return this.root;
        } else if (name === 'parent') {
            return this.parent;
        } else if (name === 'child') {
            return this.children[0];
        } else if (name === 'prev' || name === 'next') {
            return this.parent?.children[this.parent?.children.indexOf(this) + (name === 'prev' ? -1 : 1)];
        } else {
            const m = name.match(/^child([0-9])$/);
            if (m) {
                return this.children[parseInt(m[1])];
            }
            return this[name];
        }
    }

    get _defaultProperties() {
        return {
            background: [e => '', []],
            backgroundColor: [e => '', []],
            borderBottom: [e => 0, []],
            borderColor: [e => '', []],
            borderLeft: [e => 0, []],
            borderRadius: [e => 0, []],
            borderRight: [e => 0, []],
            borderStyle: [e => 'solid', []],
            borderTop: [e => 0, []],
            boxShadow: [e => '', []],
            caretColor: [e => '', []],
            ch: [e => 0, []],
            color: [e => '', []],
            cursor: [e => 'inherit', []],
            cw: [e => 0, []],
            fontFamily: [e => 'Roboto, SourceHanSans, NotoColorEmoji', []],
            fontSize: [e => 0, []],
            fontVariantLigatures: [e => 'none', []],
            h: [e => 0, []],
            hovered: [e => false, []],
            hoveredByMouse: [e => false, []],
            innerText: [e => '', []],
            lineHeight: [e => 0, []],
            onActive: [e => undefined, []],
            onClick: [e => undefined, []],
            onClickOutside: [e => undefined, []],
            onCompositionEnd: [e => undefined, []],
            onCompositionStart: [e => undefined, []],
            onCompositionUpdate: [e => undefined, []],
            onCopy: [e => undefined, []],
            onCut: [e => undefined, []],
            onDoubleClick: [e => undefined, []],
            onFocus: [e => undefined, []],
            onHover: [e => undefined, []],
            onInput: [e => undefined, []],
            onKeyDown: [e => undefined, []],
            onKeyUp: [e => undefined, []],
            onMouseDown: [e => undefined, []],
            onMouseMove: [e => undefined, []],
            onMouseUp: [e => undefined, []],
            onPaste: [e => undefined, []],
            onScrollLeft: [e => undefined, []],
            onScrollTop: [e => undefined, []],
            onWheel: [e => undefined, []],
            opacity: [e => 1, []],
            outline: [e => 'none', []],
            position: [e => 'absolute', []],
            scrollLeft: [e => 0, []],
            scrollTop: [e => 0, []],
            userSelect: [e => 'none', []],
            v: [e => 0, []],
            w: [e => 0, []],
            x: [e => 0, []],
            x2: [e => 0, []],
            y: [e => 0, []],
            y2: [e => 0, []],
            zIndex: [e => 0, []],
        };
    };

    // builtin properties
    get background() { return this._properties.background.value; }
    get backgroundColor() { return this._properties.backgroundColor.value; }
    get borderBottom() { return this._properties.borderBottom.value; }
    get borderColor() { return this._properties.borderColor.value; }
    get borderLeft() { return this._properties.borderLeft.value; }
    get borderRadius() { return this._properties.borderRadius.value; }
    get borderRight() { return this._properties.borderRight.value; }
    get borderStyle() { return this._properties.borderStyle.value; }
    get borderTop() { return this._properties.borderTop.value; }
    get boxShadow() { return this._properties.boxShadow.value; }
    get caretColor() { return this._properties.caretColor.value; }
    get ch() { return this._properties.ch.value; }
    get color() { return this._properties.color.value; }
    get cursor() { return this._properties.cursor.value; }
    get cw() { return this._properties.cw.value; }
    get fontFamily() { return this._properties.fontFamily.value; }
    get fontSize() { return this._properties.fontSize.value; }
    get fontVariantLigatures() { return this._properties.fontVariantLigatures.value; }
    get h() { return this._properties.h.value; }
    get hovered() { return this._properties.hovered.value; }
    get hoveredByMouse() { return this._properties.hoveredByMouse.value; }
    get innerText() { return this._properties.innerText.value; }
    get lineHeight() { return this._properties.lineHeight.value; }
    get onActive() { return this._properties.onActive.value; }
    get onClick() { return this._properties.onClick.value; }
    get onClickOutside() { return this._properties.onClickOutside.value; }
    get onCompositionEnd() { return this._properties.onCompositionEnd.value; }
    get onCompositionStart() { return this._properties.onCompositionStart.value; }
    get onCompositionUpdate() { return this._properties.onCompositionUpdate.value; }
    get onCopy() { return this._properties.onCopy.value; }
    get onCut() { return this._properties.onCut.value; }
    get onDoubleClick() { return this._properties.onDoubleClick.value; }
    get onFocus() { return this._properties.onFocus.value; }
    get onHover() { return this._properties.onHover.value; }
    get onInput() { return this._properties.onInput.value; }
    get onKeyDown() { return this._properties.onKeyDown.value; }
    get onKeyUp() { return this._properties.onKeyUp.value; }
    get onMouseDown() { return this._properties.onMouseDown.value; }
    get onMouseMove() { return this._properties.onMouseMove.value; }
    get onMouseUp() { return this._properties.onMouseUp.value; }
    get onPaste() { return this._properties.onPaste.value; }
    get onScrollLeft() { return this._properties.onScrollLeft.value; }
    get onScrollTop() { return this._properties.onScrollTop.value; }
    get onWheel() { return this._properties.onWheel.value; }
    get opacity() { return this._properties.opacity.value; }
    get outline() { return this._properties.outline.value; }
    get position() { return this._properties.position.value; }
    get scrollLeft() { return this._properties.scrollLeft.value; }
    get scrollTop() { return this._properties.scrollTop.value; }
    get userSelect() { return this._properties.userSelect.value; }
    get v() { return this._properties.v.value; }
    get w() { return this._properties.w.value; }
    get x() { return this._properties.x.value; }
    get x2() { return this._properties.x2.value; }
    get y() { return this._properties.y.value; }
    get y2() { return this._properties.y2.value; }
    get zIndex() { return this._properties.zIndex.value; }

    set background(v) {
        if (this.background !== v) {
            this._properties.background.value = v;
            this.ref.style.background = v;
        }
    }
    set backgroundColor(v) {
        if (this.backgroundColor !== v) {
            this._properties.backgroundColor.value = v;
            this.ref.style.backgroundColor = v;
        }
    }
    set borderBottom(v) {
        if (this.borderBottom !== v) {
            this._properties.borderBottom.value = v;
            this.ref.style.borderBottomWidth = v + 'px';
        }
    }
    set borderColor(v) {
        if (this.borderColor !== v) {
            this._properties.borderColor.value = v;
            this.ref.style.borderColor = v;
        }
    }
    set borderLeft(v) {
        if (this.borderLeft !== v) {
            this._properties.borderLeft.value = v;
            this.ref.style.borderLeftWidth = v + 'px';
        }
    }
    set borderRadius(v) {
        if (this.borderRadius !== v) {
            this._properties.borderRadius.value = v;
            this.ref.style.borderRadius = v + 'px';
        }
    }
    set borderRight(v) {
        if (this.borderRight !== v) {
            this._properties.borderRight.value = v;
            this.ref.style.borderRightWidth = v + 'px';
        }
    }
    set borderStyle(v) {
        if (this.borderStyle !== v) {
            this._properties.borderStyle.value = v;
            this.ref.style.borderStyle = v;
        }
    }
    set borderTop(v) {
        if (this.borderTop !== v) {
            this._properties.borderTop.value = v;
            this.ref.style.borderTopWidth = v + 'px';
        }
    }
    set boxShadow(v) {
        if (this.boxShadow !== v) {
            this._properties.boxShadow.value = v;
            this.ref.style.boxShadow = v;
        }
    }
    set caretColor(v) {
        if (this.caretColor !== v) {
            this._properties.caretColor.value = v;
            this.ref.style.caretColor = v;
        }
    }
    set ch(v) {
        if (this.ch !== v) {
            this._properties.ch.value = v;
        }
    }
    set color(v) {
        if (this.color !== v) {
            this._properties.color.value = v;
            this.ref.style.color = v;
        }
    }
    set cursor(v) {
        if (this.cursor !== v) {
            this._properties.cursor.value = v;
            this.ref.style.cursor = v;
        }
    }
    set cw(v) {
        if (this.cw !== v) {
            this._properties.cw.value = v;
        }
    }
    set fontFamily(v) {
        if (this.fontFamily !== v) {
            this._properties.fontFamily.value = v;
            this.ref.style.fontFamily = v;
        }
    }
    set fontSize(v) {
        if (this.fontSize !== v) {
            this._properties.fontSize.value = v;
            this.ref.style.fontSize = v + 'px';
        }
    }
    set fontVariantLigatures(v) {
        if (this.fontVariantLigatures !== v) {
            this._properties.fontVariantLigatures.value = v;
            this.ref.style.fontVariantLigatures = v;
        }
    }
    set h(v) {
        if (this.h !== v) {
            this._properties.h.value = v;
            this.ref.style.height = v + 'px';
        }
    }
    set hovered(v) {
        if (this.hovered !== v) {
            this._properties.hovered.value = v;
        }
    }
    set hoveredByMouse(v) {
        if (this.hoveredByMouse !== v) {
            this._properties.hoveredByMouse.value = v;
        }
    }
    set innerText(v) {
        if (typeof(v) === 'string' && this.tag === 'span') {
            this._properties.innerText.value = v;
            this.ref.innerText = v;
        }
    }
    set lineHeight(v) {
        if (this.lineHeight !== v) {
            this._properties.lineHeight.value = v;
            this.ref.style.lineHeight = v + 'px';
        }
    }
    set onActive(v) {
        if (v instanceof Function) {
            this._addSideEffect('onActive', webapp.event.addListener(this.ref, 'mousedown', ev => { const fun = v(this, ev); webapp.event.onceListener(this.ref, 'mouseup', ev => fun?.(this, ev)); }));
        }
    }
    set onClick(v) {
        if (v instanceof Function) {
            this._addSideEffect('onClick', webapp.event.addListener(this.ref, 'click', ev => v(this, ev)));
        }
    }
    set onClickOutside(v) {
        if (v instanceof Function) {
            this._addSideEffect('onClickOutside', webapp.event.addListener(document, 'click', ev => {
                const rect = this.ref.getBoundingClientRect();
                if (rect.x > ev.clientX || rect.y > ev.clientY || (rect.x + rect.width) < ev.clientX || (rect.y + rect.height) < ev.clientY) {
                    const isOutsideEvent = v(this, ev); // ev !== clickEv
                    if (isOutsideEvent) {
                        this._sideEffects.onClickOutside?.();
                    }
                }
            }));
        }
    }
    set onCompositionEnd(v) {
        if (v instanceof Function) {
            this._addSideEffect('onCompositionEnd', webapp.event.addListener(this.ref, 'compositionend', ev => v(this, ev)));
        }
    }
    set onCompositionStart(v) {
        if (v instanceof Function) {
            this._addSideEffect('onCompositionStart', webapp.event.addListener(this.ref, 'compositionstart', ev => v(this, ev)));
        }
    }
    set onCompositionUpdate(v) {
        if (v instanceof Function) {
            this._addSideEffect('onCompositionUpdate', webapp.event.addListener(this.ref, 'compositionupdate', ev => v(this, ev)));
        }
    }
    set onCopy(v) {
        if (v instanceof Function) {
            this._addSideEffect('onCopy', webapp.event.addListener(this.ref, 'copy', ev => v(this, ev)));
        }
    }
    set onCut(v) {
        if (v instanceof Function) {
            this._addSideEffect('onCut', webapp.event.addListener(this.ref, 'cut', ev => v(this, ev)));
        }
    }
    set onDoubleClick(v) {
        if (v instanceof Function) {
            this._addSideEffect('onDoubleClick', webapp.event.addListener(this.ref, 'dblclick', ev => v(this, ev)));
        }
    }
    set onFocus(v) {
        if (v instanceof Function) {
            this._addSideEffect('onFocus', webapp.event.addListener(this.ref, 'focus', ev => { const fun = v(this, ev); webapp.event.onceListener(this.ref, 'blur', ev => fun?.(this, ev)); }));
        }
    }
    set onHover(v) {
        if (v instanceof Function) {
            this._properties.onHover.value = v;
            this._addSideEffect('mouseenter', webapp.event.addListener(this.ref, 'mouseenter', ev => {
                webapp.event.onceListener(this.ref, 'mouseleave', ev => this.hoveredByMouse = false);
                this.hoveredByMouse = true;
            }));
        }
    }
    set onInput(v) {
        if (v instanceof Function) {
            this._addSideEffect('onInput', webapp.event.addListener(this.ref, 'input', ev => v(this, ev)));
        }
    }
    set onKeyDown(v) {
        if (v instanceof Function) {
            this._addSideEffect('onKeyDown', webapp.event.addListener(this.ref, 'keydown', ev => v(this, ev)));
        }
    }
    set onKeyUp(v) {
        if (v instanceof Function) {
            this._addSideEffect('onKeyUp', webapp.event.addListener(this.ref, 'keyup', ev => v(this, ev)));
        }
    }
    set onMouseDown(v) {
        if (v instanceof Function) {
            this._addSideEffect('onMouseDown', webapp.event.addListener(this.ref, 'mousedown', ev => v(this, ev)));
        }
    }
    set onMouseMove(v) {
        if (v instanceof Function) {
            this._addSideEffect('onMouseMove', webapp.event.addListener(this.ref, 'mousemove', ev => v(this, ev)));
        }
    }
    set onMouseUp(v) {
        if (v instanceof Function) {
            this._addSideEffect('onMouseUp', webapp.event.addListener(this.ref, 'mouseup', ev => v(this, ev)));
        }
    }
    set onPaste(v) {
        if (v instanceof Function) {
            this._addSideEffect('onPaste', webapp.event.addListener(this.ref, 'paste', ev => v(this, ev)));
        }
    }
    set onScrollLeft(v) {
        if (this.onScrollLeft !== v) {
            this._properties.onScrollLeft.value = v;
        }
    }
    set onScrollTop(v) {
        if (this.onScrollTop !== v) {
            this._properties.onScrollTop.value = v;
        }
    }
    set onWheel(v) {
        if (v instanceof Function) {
            this._addSideEffect('onWheel', webapp.event.addListener(this.ref, 'wheel', ev => v(this, ev)));
        }
    }
    set opacity(v) {
        if (this.opacity !== v) {
            this._properties.opacity.value = v;
            this.ref.style.opacity = v;
        }
    }
    set outline(v) {
        if (this.outline !== v) {
            this._properties.outline.value = v;
            this.ref.style.outline = v;
        }
    }
    set position(v) {
        if (this.position !== v) {
            this._properties.position.value = v;
            this.ref.style.position = v;
        }
    }
    set scrollLeft(v) {
        if (this.scrollLeft !== v) {
            this._properties.scrollLeft.value = v;
            this.onScrollLeft?.(this, v);
        }
    }
    set scrollTop(v) {
        if (this.scrollTop !== v) {
            this._properties.scrollTop.value = v;
            this.onScrollTop?.(this, v);
        }
    }
    set userSelect(v) {
        if (this.userSelect !== v) {
            this._properties.userSelect.value = v;
            this.ref.style.userSelect = v;
        }
    }
    set v(v) {
        if (this.v !== v) {
            this._properties.v.value = v;
            this.ref.style.visibility = v ? 'visible' : 'hidden';
        }
    }
    set w(v) {
        if (this.w !== v) {
            this._properties.w.value = v;
            this.ref.style.width = v + 'px';
        }
    }
    set x(v) {
        if (this.x !== v) {
            this._properties.x.value = v;
            this.ref.style.left = v + 'px';
        }
    }
    set x2(v) {
        if (this.x2 !== v) {
            this._properties.x2.value = v;
        }
    }
    set y(v) {
        if (this.y !== v) {
            this._properties.y.value = v;
            this.ref.style.top = v + 'px';
        }
    }
    set y2(v) {
        if (this.y2 !== v) {
            this._properties.y2.value = v;
        }
    }
    set zIndex(v) {
        if (this.zIndex !== v) {
            this._properties.zIndex.value = v;
            this.ref.style.zIndex = v;
        }
    }

    // builtin static properties


    // builtin methods (override it)
    onCreated() {}
    onUpdated() {}
}

class BarComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            leftRight: [e => [undefined, undefined], []],
            topBottom: [e => [undefined, undefined], []],
        }, model.properties);
        super(parent, model);
    }
    onUpdated(k, v) {
        switch (k) {
        }
    }
    static handleMouseDown(ele, mouseDownEvent) {
        const [left, right] = ele.leftRight;
        const [top, bottom] = ele.topBottom;
        const state = {prevX: mouseDownEvent.clientX, prevY: mouseDownEvent.clientY};
        const cancelMouseMoveListener = webapp.event.addListener(window, 'mousemove', ev => {
            const safeDist = 80;
            if (left && right) {
                const newX = ele.x + ev.clientX - state.prevX;
                state.prevX = ev.clientX;
                if (newX < left.x + safeDist) {
                    ele.x = left.x + safeDist;
                } else if (newX > right.x + right.w - safeDist) {
                    ele.x = right.x + right.w - safeDist;
                } else {
                    ele.x = newX;
                }
            } else if (top && bottom) {
                const newY = ele.y + ev.clientY - state.prevY;
                state.prevY = ev.clientY;
                if (newY < top.y + safeDist) {
                    ele.y = top.y + safeDist;
                } else if (newY > bottom.y + bottom.h - safeDist) {
                    ele.y = bottom.y + bottom.h - safeDist;
                } else {
                    ele.y = newY;
                }
            }
        });
        webapp.event.onceListener(window, 'mouseup', () => {
            cancelMouseMoveListener();
        });
    }
    get leftRight() { return this._properties.leftRight.value; }
    set leftRight(v) { this._properties.leftRight.value = v; }
    get topBottom() { return this._properties.topBottom.value; }
    set topBottom(v) { this._properties.topBottom.value = v; }
}

class ButtonComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            flag: [e => '', []],
            icon: [e => 'svg/el/folder.svg', []],
            selected: [e => false, []],
        }, model.properties);
        super(parent, model);
    }
    handleHover(ele, hover) {
        if (hover) {
            this.backgroundColor = this.selected ? webapp.theme.buttonSelectedBgColor : webapp.theme.buttonHoverBgColor;
        } else {
            this.backgroundColor = this.selected ? webapp.theme.buttonSelectedBgColor : webapp.theme.buttonBgColor;
        }
    }
    handleActive(ele) {
        if (ele.selected) {
            return;
        }
        const oldBgColor = ele.backgroundColor;
        ele.backgroundColor = webapp.theme.buttonActiveBgColor;
        return () => {
            ele.backgroundColor = oldBgColor;
        };
    }
    get flag() { return this._properties.flag.value; }
    set flag(v) { this._properties.flag.value = v; }
    get icon() { return this._properties.icon.value; }
    set icon(v) { this._properties.icon.value = v; }
    get selected() { return this._properties.selected.value; }
    set selected(v) { this._properties.selected.value = v; }
}

class CanvasComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
}

class ContainerComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            align: [e => 'none', []],
            childHeight: [e => 0, []],
            childWidth: [e => 0, []],
            hBar: [e => undefined, []],
            items: [e => [], []],
            list: [e => false, []],
            minWidth: [e => 0, []],
            reuseItem: [e => false, []],
            scrollBarFadeTime: [e => 0, []],
            scrollBarMargin: [e => 0, []],
            scrollBarMinLength: [e => 0, []],
            scrollBarWidth: [e => 0, []],
            scrollable: [e => false, []],
            vBar: [e => undefined, []],
            virtual: [e => false, []],
        }, model.properties);
        super(parent, model);
    }
    onCreated() {
        if (!this.list) {
            const child = webapp.createElement(this.model.slot, this);
            this.childWidth = child.w;
            this.childHeight = child.h;
            child.onUpdated((k, v) => {
                if (k === 'w') {
                    this.childWidth = v;
                } else if (k === 'h') {
                    this.childHeight = v;
                }
            });
        }

        if (this.scrollable) {
            this.hBar = new Scrollbar(this, 'h');
            this.vBar = new Scrollbar(this, 'v');
            const bars = [this.hBar, this.vBar];
            bars.forEach(bar => bar.initDraggable());
            this.onWheel = (_, ev) => {
                ev.preventDefault();
                bars.forEach(bar => bar.handleWheel(ev));
            };
        }
    }
    _updateList() {
        if (!this.list) {
            return;
        }
        const data = this.items;

        webapp.util.assert(data instanceof Array);
        const computeFunc = this.model.slot.staticProperties.compute;
        webapp.util.assert(computeFunc instanceof Function);

        const scrollLeft = this.scrollLeft || 0;
        const scrollTop = this.scrollTop || 0;
        const RESERVED_COUNT = 2;
        let mw = 0;
        let mh = 0;
        const computedItems = [];
        const visible = [];
        let prevItem = null;
        for (let i = 0; i < data.length; i++) {
            const item = computeFunc(this, i, prevItem);
            webapp.util.assert(typeof(item.key) === 'string');
            computedItems.push(item);
            prevItem = item;

            mw = Math.max(item.x + item.w, mw);
            mh = Math.max(item.y + item.h, mh);

            if (!this.virtual) {
                visible.push(i);
            } else {
                const x = prevItem.x - scrollLeft;
                const x2 = x + prevItem.w;
                const y = prevItem.y - scrollTop;
                const y2 = y + prevItem.h;
                if (!(x > this.w || x2 < 0 || y > this.h || y2 < 0)) {
                    visible.push(i);
                }
            }
        }

        if (this.reuseItem) {
            const old = {};
            for (let i = RESERVED_COUNT; i < this.children.length; i++) {
                const child = this.children[i];
                const key = child.data.key;
                webapp.util.assert(typeof(key) === 'string');
                if (key in old) {
                    old[key].push(child);
                } else {
                    old[key] = [child];
                }
            }

            const hitKey = {};
            visible.forEach(i => {
                const key = computedItems[i].key;
                webapp.util.assert(typeof(key) === 'string');
                if (key in old && old[key].length > 0) {
                    hitKey[i] = old[key].shift();
                }
            });
            let other = [];
            Object.values(old).forEach(t => other = other.concat(t));

            const nonHitKey = [];
            visible.forEach(i => {
                let child = hitKey[i];
                if (!child) {
                    child = other.shift();
                    if (!child) {
                        child = webapp.createElement(this.model.slot, this);
                        ['x', 'y', 'w', 'h'].forEach(k => child._properties[k].reset());
                    }
                    nonHitKey.push(child);
                }
            });
            other.forEach(t => webapp.removeElement(t));

            webapp.log.trace(`total: ${visible.length}, hit: ${Object.values(hitKey).length}, non hit: ${nonHitKey.length}`);

            visible.forEach(i => {
                const item = computedItems[i];
                const child = hitKey[i] || nonHitKey.shift();
                child.data = item;
                child.x = item.x - scrollLeft;
                child.y = item.y - scrollTop;
                child.w = item.w;
                child.h = item.h;
            });
        } else {
            while (this.children.length > visible.length + 2) {
                const child = this.children[this.children.length - 1];
                webapp.removeElement(child);
            }
            while (this.children.length < visible.length + 2) {
                webapp.createElement(this.model.slot, this);
            }
            for (let i = 0; i < visible.length; i++) {
                const child = this.children[i+RESERVED_COUNT];
                const item = computedItems[visible[i]];
                child.data = item;
                child.x = item.x - scrollLeft;
                child.y = item.y - scrollTop;
                child.w = item.w;
                child.h = item.h;
            }
        }

        this.childWidth = this.minWidth > 0 ? Math.max(mw, this.minWidth) : mw;
        this.childHeight = mh;
        if (this.align !== 'none') {
            const w = this.align === 'max' ? this.childWidth : Math.max(this.childWidth, this.cw);
            for (let i = RESERVED_COUNT; i < this.children.length; i++) {
                const child = this.children[i];
                child.w = w;
            }
        }

        if (this.scrollable) {
            if (mw - scrollLeft < this.cw) {
                this.scrollLeft = Math.max(mw - this.cw, 0);
            }
            if (mh - scrollTop < this.ch) {
                this.scrollTop = Math.max(mh - this.ch, 0);
            }
            this.hBar?.show(true);
            this.vBar?.show(true);
        }
    }
    onUpdated(k) {
        // items
        if (k === 'items' && this.list) {
            this._updateList();
        }

        // scroll
        if (this.list && this.virtual && this.items instanceof Array) {
            if ((k === 'scrollLeft' || k === 'scrollTop') && this.items instanceof Array){
                this._updateList();
            }
        } else if (this.list) {
            const RESERVED_COUNT = 2;
            if (k === 'scrollLeft') {
                for (let i = RESERVED_COUNT; i < this.children.length; i++) {
                    const child = this.children[i];
                    child.x = child.data.x - this.scrollLeft;
                }
            } else if (k === 'scrollTop') {
                for (let i = RESERVED_COUNT; i < this.children.length; i++) {
                    const child = this.children[i];
                    child.y = child.data.y - this.scrollTop;
                }
            }
        }

        // w & h -> 影响scroll
        if (this.scrollable) {
            if ((k === 'w' || k === 'h') && this.items instanceof Array) {
                this._updateList();
            }
        }
    }
    get hBar() { return [0].reduce((prev, i) => prev.children[i], this); }
    get vBar() { return [1].reduce((prev, i) => prev.children[i], this); }
    get align() { return this._properties.align.value; }
    set align(v) { this._properties.align.value = v; }
    get childHeight() { return this._properties.childHeight.value; }
    set childHeight(v) { this._properties.childHeight.value = v; }
    get childWidth() { return this._properties.childWidth.value; }
    set childWidth(v) { this._properties.childWidth.value = v; }
    get hBar() { return this._properties.hBar.value; }
    set hBar(v) { this._properties.hBar.value = v; }
    get items() { return this._properties.items.value; }
    set items(v) { this._properties.items.value = v; }
    get list() { return this._properties.list.value; }
    set list(v) { this._properties.list.value = v; }
    get minWidth() { return this._properties.minWidth.value; }
    set minWidth(v) { this._properties.minWidth.value = v; }
    get reuseItem() { return this._properties.reuseItem.value; }
    set reuseItem(v) { this._properties.reuseItem.value = v; }
    get scrollBarFadeTime() { return this._properties.scrollBarFadeTime.value; }
    set scrollBarFadeTime(v) { this._properties.scrollBarFadeTime.value = v; }
    get scrollBarMargin() { return this._properties.scrollBarMargin.value; }
    set scrollBarMargin(v) { this._properties.scrollBarMargin.value = v; }
    get scrollBarMinLength() { return this._properties.scrollBarMinLength.value; }
    set scrollBarMinLength(v) { this._properties.scrollBarMinLength.value = v; }
    get scrollBarWidth() { return this._properties.scrollBarWidth.value; }
    set scrollBarWidth(v) { this._properties.scrollBarWidth.value = v; }
    get scrollable() { return this._properties.scrollable.value; }
    set scrollable(v) { this._properties.scrollable.value = v; }
    get vBar() { return this._properties.vBar.value; }
    set vBar(v) { this._properties.vBar.value = v; }
    get virtual() { return this._properties.virtual.value; }
    set virtual(v) { this._properties.virtual.value = v; }
}

class ContainerItemComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            data: [e => ({h: 0, index: 0, key: '', w: 0, x: 0, y: 0}), []],
        }, model.properties);
        model.staticProperties = Object.assign({
            compute: undefined,
        }, model.staticProperties);
        super(parent, model);
    }
    get data() { return this._properties.data.value; }
    set data(v) { this._properties.data.value = v; }
    get compute() { return this._staticProperties.compute; }
    set compute(v) { this._staticProperties.compute = v; }
}

class DivComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
}

class DividerComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
}

class IframeComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
    setHtml(html) {
        this.ref.srcdoc = html;
    }
}

class EditorComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
    onCreated() {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        if (urlParams.has('code')) {
            const codeValue = urlParams.get('code');
            const decodedValue = decodeURIComponent(codeValue);
            const options = {
                value: decodedValue,
                language: 'go',
                theme: 'vs',
                automaticLayout: true,
                lineNumbers: 'on', // 'off'
                minimap: {
                    enabled: false,
                },
                readOnly: true,
                // fontFamily: '',
                // glyphMargin: false,
                // suggestOnTriggerCharacters: false,
            };
            this._editor = monaco.editor.create(this.ref, options);
        } else {
            webapp.util.fetch('<base_url>/code/get' + queryString).then(v => {
                const options = {
                    value: v,
                    language: 'go',
                    theme: 'vs',
                    automaticLayout: true,
                    lineNumbers: 'on', // 'off'
                    minimap: {
                        enabled: false,
                    },
                    readOnly: true,
                    // fontFamily: '',
                    // glyphMargin: false,
                    // suggestOnTriggerCharacters: false,
                };
                this._editor = monaco.editor.create(this.ref, options);
            }).catch(err => webapp.log.error(err));
        }
    }

    _destroy() {
        this._editor.dispose();
        super._destroy();
    }
    setValue(v) {
        this._editor.setValue(v);
    }
}


class DiffEditorComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
    onCreated() {
        const queryString = window.location.search;
        webapp.util.fetch('<base_url>/code/get' + queryString).then(v => {
            const leftModel = monaco.editor.createModel('原始文本', 'text/plain');
            const rightModel = monaco.editor.createModel('修改后的文本', 'text/plain');

            const diffEditor = monaco.editor.createDiffEditor(this.ref, {
                automaticLayout: true
            });
            diffEditor.setModel({
                original: leftModel,
                modified: rightModel
            });
        }).catch(err => webapp.log.error(err));
    }

    _destroy() {
        this._editor.dispose();
        super._destroy();
    }
    setValue(v) {
        this._editor.setValue(v);
    }
}

function registerLanguageJsm() {
    const id = 'jsm';
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, {
        tokenizer: {
            root: [
                [/\d+/, "number"],
                [/\b(array|component|enum|function|import|list|map|object|private|public|static|struct|type)\b/, "keyword"],
                [/'/, 'string', "@string_s"],
                [/"/, 'string', "@string_d"],
                [/\/\/.*$/, "comment"],
                [/\/\*/, 'comment', '@comment'],
            ],
            string_s: [
                [/[^\\']*$/, 'string', '@popall'],
                [/[^\\']+/, 'string'],
                [/\\./, 'string'],
                [/'/, 'string', '@popall'],
                [/\\$/, 'string'],
            ],
            string_d: [
                [/[^\\"]*$/, 'string', '@popall'],
                [/[^\\"]+/, 'string'],
                [/\\./, 'string'],
                [/'/, 'string', '@popall'],
                [/\\$/, 'string'],
            ],
            comment: [
                [/\*\//, 'comment', '@popall'],
                [/\*[^/]/, 'comment'],
                [/[^*]+/, 'comment']
            ],
        },
    });
    monaco.languages.setLanguageConfiguration(id, {
        surroundingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" }
        ],
        autoClosingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
        ],
        brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    });
}

// https://github.com/microsoft/monaco-editor/releases/tag/v0.50.0
// https://www.npmjs.com/package/monaco-editor-core/v/0.50.0?activeTab=code
class JsmEditorComponent extends Component {
    static registered = false;
    constructor(parent, model) {
        super(parent, model);

        if (!JsmEditorComponent.registered) {
            registerLanguageJsm();
        }

        const queryString = window.location.search;
        webapp.util.fetch('<base_url>/code/get' + queryString).then(v => {
            const options = {
                value: `type TopComponent component[
   Component
]

component top[TopComponent](tag=div) {
   div() {
       
   }
}`,
                language: 'jsm',
                theme: 'vs',
                automaticLayout: true,
                lineNumbers: 'on', // 'off'
                minimap: {
                    enabled: false,
                },
                // readOnly: true,
                // fontFamily: '',
                // glyphMargin: false,
                // suggestOnTriggerCharacters: false,
            };
            this._editor = monaco.editor.create(this.ref, options);
        }).catch(err => webapp.log.error(err));
    }
    _destroy() {
        this._editor.dispose();
        super._destroy();
    }
    setValue(v) {
        this._editor.setValue(v);
    }
    getValue() {
        return this._editor.getValue();
    }
}

class ImgComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            src: [e => '', []],
        }, model.properties);
        super(parent, model);
    }
    onUpdated(k, v) {
        switch (k) {
            case 'src':
                if (this.tag === 'svg') {
                    webapp.util.fetch('<base_url>/public/static/' + this.src).then(v => this.ref.innerHTML = v).catch(err => webapp.log.error(err));
                } else if (this.tag === 'img') {
                    this.ref.setAttribute(k, '<base_url>/public/static/' + this.src);
                }
                break;
            default:
                break;
        }
    }
    get src() { return this._properties.src.value; }
    set src(v) { this._properties.src.value = v; }
}

class InputComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            placeholder: [e => '', []],
        }, model.properties);
        super(parent, model);
    }
    onUpdated(k, v) {
        switch (k) {
            case 'placeholder':
                this.ref.placeholder = v;
                break;
            default:
                break;
        }
    }
    get placeholder() { return this._properties.placeholder.value; }
    set placeholder(v) { this._properties.placeholder.value = v; }
}

class ScrollbarComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            showLeft: [e => false, []],
            showTop: [e => false, []],
            vertical: [e => false, []],
        }, model.properties);
        super(parent, model);
    }
    get showLeft() { return this._properties.showLeft.value; }
    set showLeft(v) { this._properties.showLeft.value = v; }
    get showTop() { return this._properties.showTop.value; }
    set showTop(v) { this._properties.showTop.value = v; }
    get vertical() { return this._properties.vertical.value; }
    set vertical(v) { this._properties.vertical.value = v; }
}

class TextComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            align: [e => 'left', []],
            text: [e => '', []],
        }, model.properties);
        super(parent, model);
    }
    onUpdated(k, v) {
        switch (k) {
            case 'text':
                this.ref.innerText = v;
                break;
            case 'align':
                if (v === 'left') {
                    // this.ref.style.left = '0px';
                } else if (v === 'right') {

                } else {

                }
                break;
            default:
                break;
        }
    }
    get align() { return this._properties.align.value; }
    set align(v) { this._properties.align.value = v; }
    get text() { return this._properties.text.value; }
    set text(v) { this._properties.text.value = v; }
}

class TextareaComponent extends Component {
    constructor(parent, model) {
        super(parent, model);
    }
}

class TreeComponent extends Component {
    constructor(parent, model) {
        model.properties = Object.assign({
            focus: [e => false, []],
            items: [e => [], []],
            nodeMap: [e => undefined, []],
            onClickItem: [e => undefined, []],
            selectedChildTop: [e => 0, []],
        }, model.properties);
        model.staticProperties = Object.assign({
            itemHeight: 22,
        }, model.staticProperties);
        super(parent, model);
    }
    onUpdated(k, v) {
        if (k === 'items') {
            this.nodeMap = this.makeNodeMap(v);
            this.containerEle.items = this.nodeToItems(this.nodeMap, '', 0, 0);
            this.selectedEle.v = 0;
        }
    }
    static sortChildren(node) {
        if (node.children.length > 0) {
            node.children.sort((a, b) => {
                if (!!a.children.length === !!b.children.length) {
                    return a.key.localeCompare(b.key);
                }
                return a.children.length > 0 ? -1 : 1;
            });
            node.children.forEach(TreeComponent.sortChildren);
        }
    }
    makeNodeMap(items) {
        items.sort();
        const nodeMap = {};
        nodeMap[''] = {
            parent: null,
            key: '',
            text: '',
            children: [],
            collapsed: false,
        };
        items.forEach(item => {
            let key = '';
            item.split('/').forEach(tmp => {
                const parent = nodeMap[key];
                key = key ? [key, tmp].join('/') : tmp;
                if (!nodeMap[key]) {
                    nodeMap[key] = {
                        parent: parent,
                        key: key,
                        text: tmp,
                        children: [],
                        collapsed: true,
                    };
                    parent.children.push(nodeMap[key]);
                }
            });
        });
        Object.values(nodeMap).forEach(TreeComponent.sortChildren);
        return nodeMap;
    }
    nodeToItems(nodeMap, key, index, depth){
        const node = nodeMap[key];
        if (!node || !node.children || node.collapsed) {
            return [];
        }
        let ret = [];
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            const childNode = children[i];
            const item = {
                index: index,
                key: childNode.key,
                depth: depth,
                leaf: childNode.children.length === 0,
                collapsed: childNode.collapsed,
                text: childNode.text,
            };
            ret.push(item);
            const tmp = this.nodeToItems(
                nodeMap,
                childNode.key,
                index + 1,
                depth + 1,
            );
            ret = ret.concat(tmp);
            index = index + tmp.length + 1;
        }
        return ret;
    }
    static compute(container, index) {
        const data = container.items[index];
        const h = container.root.itemHeight;
        return Object.assign(data, {
            index,
            key: data.key,
            x: 0,
            y: index * h,
            w: data.depth * 20 + webapp.util.textWidth(data.text, container.fontFamily, 12) + 40,
            h,
        });
    }
    selectChild(child, focus) {
        this.selectedChildTop = child.y + this.containerEle.scrollTop;
        this.selectedEle.v = 1;
        this.focus = focus;
    }
    handleClick(child, ev) {
        this.selectChild(child, true);
        // 通知发生点击事件
        if (this.onClickItem instanceof Function) {
            this.onClickItem(child, ev);
        }
        // 目录展开折叠
        if (!child.data.leaf) {
            const {key} = child.data;
            const node = this.nodeMap[key];
            node.collapsed = !node.collapsed;
            this.containerEle.items = this.nodeToItems(this.nodeMap, '', 0, 0);
        }
        // 处理blur
        this.onClickOutside = (_, event) => {
            if (ev !== event) {
                this.focus = false;
                return true;
            }
            return false;
        };
    }
    get containerEle() { return [1].reduce((prev, i) => prev.children[i], this); }
    get selectedEle() { return [0].reduce((prev, i) => prev.children[i], this); }
    get focus() { return this._properties.focus.value; }
    set focus(v) { this._properties.focus.value = v; }
    get items() { return this._properties.items.value; }
    set items(v) { this._properties.items.value = v; }
    get nodeMap() { return this._properties.nodeMap.value; }
    set nodeMap(v) { this._properties.nodeMap.value = v; }
    get onClickItem() { return this._properties.onClickItem.value; }
    set onClickItem(v) { this._properties.onClickItem.value = v; }
    get selectedChildTop() { return this._properties.selectedChildTop.value; }
    set selectedChildTop(v) { this._properties.selectedChildTop.value = v; }
    get itemHeight() { return this._staticProperties.itemHeight; }
    set itemHeight(v) { this._staticProperties.itemHeight = v; }
}