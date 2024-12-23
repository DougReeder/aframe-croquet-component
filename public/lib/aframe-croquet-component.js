/*
The MIT License (MIT)
Copyright (c) 2019-2023 Nikolai Suslov | Krestianstvo.org and contributors
*/

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

let Q = Croquet.Constants;
Q.STEP_MS = 1000 / 20;
Q.MODEL_CHANGED = 'modelChanged';
Q.MODEL_CHANGED_PREFIX = Q.MODEL_CHANGED + '-';
Q.AVATAR_PREFIX = 'avatar-';
Q.THROTTLED_ATTRIBUTES = ['position', 'rotation', 'rotationquaternion', 'scale'];
Q.AVATAR_SYNCABLE_ATTRIBUTES = [...Q.THROTTLED_ATTRIBUTES, 'multiuser'];
Q.COLORS = ['purple', 'blue', 'green', 'orange', 'yellow', 'red', 'gray', 'white', 'maroon', 'navy', 'aqua', 'lime', 'olive', 'teal', 'fuchsia', 'silver', 'black'];
Q.CAMERA_HEIGHT = 1.6;
Q.INITIAL_PLACEMENT_RADIUS = 2;
Q.FLIP_Z = new THREE.Quaternion(0, -1, 0, 0);
Q.FLIP_Z_INV = new THREE.Quaternion(0, 1, 0, 0);

class RootModel extends Croquet.Model {
    static types() {
        return {
            "THREE.Quaternion": {
                cls: THREE.Quaternion,
                write: q => [q.x, q.y, q.z, q.w],        // serialized as '[...,...,...,...]'
                read: q => new THREE.Quaternion(q[0], q[1], q[2], q[3]),
            },
        }
    }

    init(options) {
        super.init(options);
        this.syncedElementData = new Map();
        //Aware of Users
        this.userData = new Map();
        this.spawnPoint = options.spawnPoint || {x: 0, y: 0, z: 0};
        this.seeds = [];
        for (let i=0; i<25; ++i) {
            this.seeds[i] = this.random();
        }
        this.subscribe(this.sessionId, "view-join", this.addUser);
        this.subscribe(this.sessionId, "view-exit", this.deleteUser);
        this.subscribe(this.id, 'onDeleteUser', this.onDeleteUser);
        this.subscribe(this.id, 'add-multiuser-model', this.onComponentAdd);
        this.subscribe(this.id, 'delete-multiuser-model', this.onDeleteComponent);
        this.subscribe(this.id, 'updateOptions', this.updateOptions)
        this.subscribe(this.id, 'setComponentInModel', this.setComponentInModel);
    }

    newId() {
        function hex() {
            let r = Math.random();
            return Math.floor(r * 256).toString(16).padStart(2, "0");
        }

        return `${hex()}${hex()}${hex()}${hex()}`;
    }

    updateOptions(newOptions) {
        if (Number.isFinite(newOptions.spawnPoint.x) && Number.isFinite(newOptions.spawnPoint.y) && Number.isFinite(newOptions.spawnPoint.z)) {
            console.debug("RootModel: setting spawn point to", newOptions.spawnPoint);
            this.spawnPoint = newOptions.spawnPoint;
        }
    }

    onDeleteComponent(elID) {
        const elementData = this.syncedElementData.get(elID);
        if (elementData) {
            this.syncedElementData.delete(elID);
            console.debug("RootModel: deleted element data:", elID, elementData);
            this.publish(this.id, 'element-deleted', elID);
        }
    }

    onComponentAdd(data) {
        let elID = data.elID;
        if (!this.syncedElementData.has(elID)) {
            this.syncedElementData.set(elID, data);
            console.debug("RootModel: added data for element:", elID, data);
            this.publish(this.id, 'element-added', elID);
        }
    }



    addUser(viewId) {
        let data = this.userData.get(viewId);
        if (data) {
            data.online = true;
            const timeSec = (this.now() - data.start) / 1000;
            console.info(`RootModel: user ${data.color} ${viewId} rejoining & first joined ${timeSec} seconds ago (${this.viewCount} of ${this.userData.size} user(s) online):`, data);
        } else {
            const theta = this.random() * 2 * Math.PI;
            const x = this.spawnPoint.x + Q.INITIAL_PLACEMENT_RADIUS * Math.sin(theta);
            const y = this.spawnPoint.y + Q.CAMERA_HEIGHT;
            const z = this.spawnPoint.z + Q.INITIAL_PLACEMENT_RADIUS * Math.cos(theta);
            const heading = THREE.MathUtils.radToDeg(theta) + 180;
            data = {
                online: true,
                start: this.now(),
                color: Q.COLORS[this.userData.size % Q.COLORS.length],
                position: {x, y, z},
                rotation: {x: 0, y: heading, z: 0},
            };
            this.userData.set(viewId, data);
            console.info(`RootModel: user ${data.color} ${viewId} joining (${this.viewCount} of ${this.userData.size} user(s) online)`, data);
        }

        const elID = Q.AVATAR_PREFIX + viewId;
        const userElementData = this.syncedElementData.get(elID);
        if (userElementData) {
            console.debug(`RootModel: user ${data.color} ${viewId} joining; elementData exists:`, userElementData);

        } else {
            const options = {
                elID: elID,
                color: data.color,
                // sceneModel: this,
                components: {   // if a coordinate is NaN, use default
                    position: {
                        x: Number.isFinite(data.position?.x) ? data.position.x : 0,
                        y: Number.isFinite(data.position?.y) ? data.position.y : Q.CAMERA_HEIGHT,
                        z: Number.isFinite(data.position?.z) ? data.position.z : -Q.INITIAL_PLACEMENT_RADIUS
                    },
                    rotation: {x: data.rotation?.x || 0, y: data.rotation?.y || 0, z: data.rotation?.z || 0},
                    multiuser: {},
                }
            }
            console.debug(`RootModel: user ${data.color} ${viewId} joining; adding elementData:`, options);
            this.onComponentAdd(options)
        }

        this.publish(this.sessionId, 'user-added', {viewId, ...data});
    }


    deleteUser(viewId) {
        const data = this.userData.get(viewId);
        data.online = false;   // retains data, including color & positions
        const time = this.now() - this.userData.get(viewId)?.start;
        const elID = Q.AVATAR_PREFIX + viewId;
        const userElementData = this.syncedElementData.get(elID);
        if (userElementData) {
            data.position = structuredClone(userElementData.components.position);
            data.rotation = structuredClone(userElementData.components.rotation);
        }
        console.info(`user ${data?.color} ${viewId} left after ${time / 1000} seconds (${this.viewCount} of ${this.userData.size} user(s) online):`, data);
        this.onDeleteComponent(elID)
        this.publish(this.sessionId, 'user-exit', {viewId, ...data});
        //this.publish(this.viewId, 'onDeleteUser', viewId);
    }

    onDeleteUser(viewId) {
        if (this.userData.has(viewId)) {
            this.userData.delete(viewId);
        }
    }

    setComponentInModel({elID, componentName, componentValue, senderId}) {
        const components = this.syncedElementData.get(elID)?.components;
        if (components) {
            this.merge(components, { [componentName]: componentValue });
            const isAvatar = elID.startsWith('avatar');
            if (!isAvatar) {
                console.debug(`RootModel: setComponentInModel setting`, elID, componentName, components[componentName]);
            }
            const eventName = Q.THROTTLED_ATTRIBUTES.includes(componentName) ?
              Q.MODEL_CHANGED_PREFIX + componentName :
              Q.MODEL_CHANGED;
            this.publish(elID, eventName, {componentName, componentValue: components[componentName]});
        } else {
            console.error(`RootModel: setComponentInModel: no existing components for element ${elID}`);
        }
    }

    merge(target, source) {
        for (const [key, value] of Object.entries(source)) {
            if (Array.isArray(value)) {
                target[key] = structuredClone(value);
            } else if (value instanceof THREE.Quaternion) {   // new array replaces old
                target[key] = value.clone();
            } else if (value instanceof Object) {
                if (!(target[key] instanceof Object)) {
                    target[key] = {}
                }
                this.merge(target[key], value);
            } else {
                target[key] = value;
            }
        }
    }

}

class RootView extends Croquet.View {

    constructor(model) {
        super(model);

        let self = this;
        const userData = model.userData.get(this.viewId);
        this.elements = new Map();
        this.sceneModel = model;
        this.aframeScene = document.querySelector('a-scene');
        this.aframeScene.rootView = this;
        this.aframeScene.dataset.viewId = this.viewId;
        this.aframeScene.dataset.userColor = userData.color || '#ccc';
        this.aframeScene.dataset.seeds = model.seeds;

        this.aframeScene.addEventListener('add-multiuser', function (event) {
            let comp = event.detail.comp;
            if (!comp.ready) {
                if (!comp.el?.id) { throw new Error("multiuser element must have ID")}
                comp.ready = true;
                if (! self.elements.has(comp.el?.id)) {
                    console.debug('RootView: multiuser component ready; creating elementData:', comp.el?.id, event.detail);
                    const isAvatar = comp.el?.id?.startsWith(Q.AVATAR_PREFIX);
                    const components = {};
                    for (const [componentName, componentValue] of Object.entries(comp.el.components)) {
                        const [isSyncable, substitutedValue] = filterComponent(isAvatar, componentName, componentValue?.attrValue);
                        if (isSyncable) {
                            components[componentName] = substitutedValue;
                        }
                    }
                    const modelData = {
                        elID: comp.el.id,
                        parentID: comp.el.parentEl?.id,
                        elType: comp.el.localName,
                        components,
                    };
                    self.publish(model.id, "add-multiuser-model", modelData);
                }
            }
        });

        this.aframeScene.addEventListener('deleteComponent', function (event) {

            let data = event.detail.data;
            console.debug('Deleting multiuser component from scene: ', data);
            self.removeElement(data);
            self.publish(model.id, 'delete-multiuser-model', data);

        })

        this.aframeScene.addEventListener('updateOptions', (evnt) => {
            self.publish(model.id, 'updateOptions', event.detail);
        });

        this.subscribe(this.sessionId, 'user-added', this.onUserAdded);
        this.subscribe(this.sessionId, 'user-exit', this.onUserExit);
        this.subscribe(model.id, 'element-added', this.addElement);
        this.subscribe(model.id, 'element-deleted', this.removeElement)
        this.subscribe(this.viewId, "synced", this.synced);

        console.groupCollapsed(`RootView created for user ${userData.color} ${this.viewId}`);
        for (const [viewId, data] of model.userData.entries()) {
            const userLabel = viewId === this.viewId ? 'local' : 'remote';
            console.debug(`${userLabel} user:`, data);
            if (data?.online) {
                this.addElement(Q.AVATAR_PREFIX + viewId);
                this.onUserAdded({viewId, ...data});   // The user-added message was sent before this view existed
            } else {
                this.removeElement(Q.AVATAR_PREFIX + viewId);
            }
        }
        console.groupEnd();
    }

    addElement(elID) {
        const elementData = this.sceneModel.syncedElementData.get(elID);
        if (!elementData) {
            throw new Error(`RootView: can't create element ${elID} without elementData`)
        }
        let element = this.aframeScene.querySelector('#' + elementData.elID);
        if (element) {
            console.group('RootView: addElement: updating element:', element);
            for (const [componentName, componentValue] of Object.entries(elementData.components)) {
                element.emit('update-component', {componentName, componentValue});
            }
            console.groupEnd();
        } else {
            console.group('RootView: addElement: creating element:', elID, elementData);
            element = this.createElement(elementData);
            console.groupEnd()
        }
        if (this.elements.has(elID)) {
            console.debug('RootView: addElement: not re-subscribing', elID);
        } else {
            console.info('RootView: addElement: subscribing', elID);
            const handler = changeElementComponent.bind(element);
            for (const componentName of Q.THROTTLED_ATTRIBUTES) {
                this.subscribe(elID, { event: Q.MODEL_CHANGED_PREFIX + componentName, handling: 'oncePerFrame' }, handler);
            }
            this.subscribe(elID, { event: Q.MODEL_CHANGED, handling: 'queued' }, handler);
        }
        this.elements.set(elID, element);

        function changeElementComponent({componentName, componentValue}) {
            this.emit('update-component', {componentName, componentValue});
            // this.emit('update-aframe-element', {data: {[componentName]: componentValue}});
        }
    }

    createElement(elementData) {
        let element;
        if (elementData.elID.startsWith(Q.AVATAR_PREFIX)) {
            const avatarId = elementData.elID.slice(Q.AVATAR_PREFIX.length);
            if (avatarId === this.viewId) {   // the local user
                console.debug(`RootView: creating avatar for local user ${elementData.color} ${avatarId}`);
                element = document.createElement('a-box');
                element.setAttribute('width', 0.5);
                element.setAttribute('depth', 0.5);
                element.setAttribute('wireframe', true);
                element.setAttribute('visible', false);
                element.dataset.isLocalAvatar = true;
            } else {
                console.debug(`RootView: creating avatar for remote user ${elementData.color} ${avatarId}`);
                const avatarTemplate = document.getElementById('avatarTemplate');
                element = avatarTemplate ?
                    avatarTemplate.content.firstElementChild.cloneNode(true) :
                    document.createElement('a-box');
            }
            element.setAttribute('id', elementData.elID);
            element.setAttribute('color', elementData.color);
            for (const componentName of Q.AVATAR_SYNCABLE_ATTRIBUTES) {
                if (componentName in elementData.components) {
                    const aFrameValue = toAFrameValue(componentName, elementData.components[componentName])
                    element.setAttribute(componentName, aFrameValue);
                }
            }
        } else {   // ordinary A-Frame element
            console.debug(`RootView: creating element from`, elementData);
            element = document.createElement(elementData.elType);
            element.setAttribute('id', elementData.elID);
            // Model fields MUST NOT be passed to functions that might modify them.
            for (const [componentName, componentValue] of Object.entries(elementData.components)) {
                element.setAttribute(componentName, toAFrameValue(componentName, componentValue));
            }
        }
        let parent;
        if (elementData.parentID) {
            parent = document.getElementById(elementData.parentID);
        }
        if (parent) {
            parent.appendChild(element);
            console.debug(`RootView: added element:`, element, `as child of`, parent);
        } else {
            AFRAME.scenes[0].appendChild(element);
            console.debug(`RootView: added element to scene:`, element);
        }

        return element;
    }

    synced(isRevealed) {
        console.groupCollapsed(`RootView: synced: ${isRevealed ? "revealed" : "hidden"}: creating/updating elements for data:`, this.sceneModel.syncedElementData);
        for (const elID of this.sceneModel.syncedElementData.keys()) {
            this.addElement(elID)
        }
        console.groupEnd();
    }

    onUserAdded(data) {
        const userLabel = data.viewId === this.viewId ? 'local' : 'remote';
        console.debug(`RootView: ${userLabel} user added:`, data);
        this.aframeScene.emit('user-added', data);
    }

    onUserExit(data) {
        this.aframeScene.emit('user-exit', data);
    }

    removeElement(childID) {
        const elementsToDelete = new Set(document.querySelectorAll('#' + childID));
        const element = this.elements.get(childID);
        if (element) {
            elementsToDelete.add(element);
            this.elements.delete(childID);
        }

        console.debug(`RootView: removeElement: removing ${childID} elements:`, elementsToDelete);
        for (const element of elementsToDelete) {
            try {
                element.parentNode?.removeChild(element);
                element.destroy?.();   // only A-Frame elements have this
            } catch (err) {
                console.error(`while removing element:`, err, element);
            }
        }
    }

    setComponentInModel(element, componentName, componentValue) {
        const isAvatar = element.id?.startsWith(Q.AVATAR_PREFIX);
        const [isSyncable, substitutedValue] = filterComponent(isAvatar, componentName, componentValue);
        if (isSyncable) {
            if (!isAvatar) {
                console.debug(`RootView: setComponentInModel:`, element.id, componentName, substitutedValue)
            }

            this.publish(this.sceneModel.id, 'setComponentInModel', {
                elID: element.id,
                  componentName,
                  componentValue: substitutedValue,
                  senderId: this.viewId
              });
        } else {
            console.debug(`RootView: setComponentInModel not sync-able:`, element.id, componentName, substitutedValue)
        }
    }

    detach() {
        super.detach();
        console.info(`RootView detach: not destroying elements`);
    }

}

function filterComponent(isAvatar, componentName, componentValue) {
    if (!isAvatar || Q.AVATAR_SYNCABLE_ATTRIBUTES.includes(componentName)) {
        try {
            if (componentValue?.attrName === componentName) {
                console.warn(`component ${componentName} was passed with outer object`)
                return [true, substitute(componentValue?.attrValue, [componentValue?.attrValue])];
            } else {
                return [true, substitute(componentValue, [componentValue])];
            }
        } catch (err) {
            console.error(`ComponentView: while copying component ${componentName}:`, componentValue, err);
            return [false, null];
        }
    } else {
        console.debug(`ComponentView: not setting non-syncable ${componentName} to`, componentValue);
        return [false, null];
    }
}

function substitute(inputValue, stack) {
    if (inputValue instanceof HTMLElement) {   // presumably an asset
        return '#' + inputValue.id;
    } else if (Array.isArray(inputValue) ||
      inputValue instanceof THREE.Quaternion) {
        return inputValue;
    } else if (inputValue && 'object' === typeof inputValue) {
        const substitutedProp = {};
        for (const [key, value] of Object.entries(inputValue)) {
            if ('function' === typeof value) {   // functions aren't serializable
                continue;
            }
            if (stack.includes(value)) {   // doesn't allow cyclic structures
                continue;
            }
            substitutedProp[key] = substitute(value, [...stack, value]);
        }
        return substitutedProp;
    } else {
        return inputValue;
    }
}



RootModel.register("RootModel");


AFRAME.registerComponent('croquet', {

    schema: {
        sessionName: { default: 'demo' },
        password: { default: 'demo' },
        apiKey: {default: 'myApiKey'},
        tps: { type: 'number', default: 20 },   // ticks per second
        spawnPoint: {type: 'vec3'},
    },

    init: function () {
        //Croquet.startSession(this.data.sessionName, RootModel, RootView);
        //Croquet.startSession(this.data.sessionName, RootModel, RootView, { step: "manual" })
        let sessionName = this.data.sessionName == 'demo' ? Croquet.App.autoSession() : this.data.sessionName;
        let password = this.data.password == 'demo' ? Croquet.App.autoPassword() : this.data.password;
        let apiKey = this.data.apiKey == 'myApiKey' ? '1MAgJydFdvcKpGkHe7bhxLmr3Hj4mofPKvC06mpII' : this.data.apiKey;
        Croquet.Session.join(
            {
                apiKey: apiKey,
                appId: "com.aframe.multiuser",
                name: sessionName,
                password: password,
                tps: this.data.tps,
                model: RootModel,
                options: {spawnPoint: this.data.spawnPoint},
                view: RootView
                //debug: ["session"]
            }
        ).then(session => {
            let self = this;
            let xrSession = null;

            function renderFrame(time, xrFrame) {
                session.step(time);
            }

            function onWindowAnimationFrame(time) {
                window.requestAnimationFrame(onWindowAnimationFrame);
                if (!xrSession) {
                    renderFrame(time, null)
                }
            }
            window.requestAnimationFrame(onWindowAnimationFrame)

            function onXRAnimationFrame(time, xrFrame) {
                if(xrSession) {
                    xrSession.requestAnimationFrame(onXRAnimationFrame);
                    renderFrame(time, xrFrame);
                }
            }

            function startXRSession() {
                if (self.el.xrSession) {
                    xrSession = self.el.xrSession
                    xrSession.requestAnimationFrame(onXRAnimationFrame)
                }
            }

            function onXRSessionEnded() {
                xrSession = null
            }

            this.el.addEventListener('enter-vr', startXRSession);
            this.el.addEventListener('exit-vr', onXRSessionEnded);

        });
    },

    update: function (oldData) {
        const options = {};
        if (! AFRAME.utils.deepEqual(this.data.spawnPoint, oldData.spawnPoint)) {
            options.spawnPoint = this.data.spawnPoint;
        }
        if (Object.keys(options).length > 0) {
            this.el.emit('updateOptions', options, false);
        }
        //TODO: create new user-defined sessions
    },

    tick: function (t) {
    }
})



AFRAME.registerComponent('multiuser', {

    schema: {
        anim: { type: 'boolean', default: false }
    },

    init: function () {
        let self = this;
        this.handlers = {
            setComponent: this.setComponent.bind(this),
        }

        this.scene = this.el.sceneEl;
        this.ready = false;

        if (this.el.dataset.isLocalAvatar) {
            this.cameraEnt = this.scene.querySelector('[camera]');
            this.rigEnt = this.cameraEnt?.parentElement;
            if ('A-SCENE' === this.rigEnt.nodeName) {
                this.rigEnt = this.cameraEnt;
            }

            const position = structuredClone(this.el.components.position?.attrValue);
            if (Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(position?.z)) {
                position.y -= Q.CAMERA_HEIGHT;
                console.info(`multiuser: from avatar, setting rig position to`, position);
                this.rigEnt.setAttribute('position', position);
            } else {
                console.warn(`multiuser: bad position of avatar:`, position);
            }

            const qCamera = new THREE.Quaternion();
            qCamera.copy(this.cameraEnt.object3D.quaternion);
            qCamera.invert();
            const q = new THREE.Quaternion();
            q.setFromEuler(new THREE.Euler(
                THREE.MathUtils.degToRad(this.el.components.rotation?.attrValue?.x),
                THREE.MathUtils.degToRad(this.el.components.rotation?.attrValue?.y),
                THREE.MathUtils.degToRad(this.el.components.rotation?.attrValue?.z),
                'XYZ'));
            q.multiply(Q.FLIP_Z_INV);
            q.multiply(qCamera);
            if (Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)) {
                this.rigEnt.object3D.quaternion.copy(q);
                console.info(`multiuser: from avatar, setting quaternion of rig to:`, q);
            } else {
                console.warn(`multiuser: bad rotation of avatar or quaternion of camera:`, q, qCamera);
            }
        }

        Reflect.defineProperty(this.el,
            'setAttributeAFrame', {
            value: (this.originalSetAttribute)(),
            writable: true
        }
        )

        Reflect.defineProperty(this.el,
            'setAttribute', {
            value: (this.croquetSetAttribute)(),
            writable: true
        }
        )

        this.el.addEventListener('update-component', this.handlers.setComponent);
    },

    setComponent: function (evt) {
        const {componentName, componentValue} = evt.detail;
        const aFrameValue = toAFrameValue(componentName, componentValue);
        if (! this.el.id?.startsWith('avatar')) {
            console.debug(`multiuser: setComponent: setting element “${this.el.id}” component “${componentName}” to`, aFrameValue);
        }
        this.el.setAttributeAFrame(componentName, aFrameValue);
    },

    //Original definition from A-Frame master
    originalSetAttribute: function () {
        var singlePropUpdate = {};
        var MULTIPLE_COMPONENT_DELIMITER = '__';
        var COMPONENTS = AFRAME.components;

        return function (attrName, arg1, arg2) {
            var newAttrValue;
            var clobber;
            var componentName;
            var delimiterIndex;
            var isDebugMode;
            var key;

            delimiterIndex = attrName.indexOf(MULTIPLE_COMPONENT_DELIMITER);
            componentName = delimiterIndex > 0 ? attrName.substring(0, delimiterIndex) : attrName;

            // Not a component. Normal set attribute.
            if (!COMPONENTS[componentName]) {
                if (attrName === 'mixin') { this.mixinUpdate(arg1); }
                AFRAME.ANode.prototype.setAttribute.call(this, attrName, arg1);
                return;
            }

            // Initialize component first if not yet initialized.
            if (!this.components[attrName] && this.hasAttribute(attrName)) {
                this.updateComponent(
                    attrName,
                    window.HTMLElement.prototype.getAttribute.call(this, attrName));
            }

            // Determine new attributes from the arguments
            if (typeof arg2 !== 'undefined' &&
                typeof arg1 === 'string' &&
                arg1.length > 0 &&
                typeof AFRAME.utils.styleParser.parse(arg1) === 'string') {
                // Update a single property of a multi-property component
                for (key in singlePropUpdate) { delete singlePropUpdate[key]; }
                newAttrValue = singlePropUpdate;
                newAttrValue[arg1] = arg2;
                clobber = false;
            } else {
                // Update with a value, object, or CSS-style property string, with the possiblity
                // of clobbering previous values.
                newAttrValue = arg1;
                clobber = (arg2 === true);
            }

            // Update component
            this.updateComponent(attrName, newAttrValue, clobber);

            // In debug mode, write component data up to the DOM.
            isDebugMode = this.sceneEl && this.sceneEl.getAttribute('debug');
            if (isDebugMode) { this.components[attrName].flushToDOM(); }
        };
    },

    //Modified definition from A-Frame master
    croquetSetAttribute: function () {
        var singlePropUpdate = {};
        var MULTIPLE_COMPONENT_DELIMITER = '__';
        var COMPONENTS = AFRAME.components;
        let self = this

        return function (attrName, arg1, arg2) {
            var newAttrValue;
            var clobber;
            var componentName;
            var delimiterIndex;
            var isDebugMode;
            var key;

            delimiterIndex = attrName.indexOf(MULTIPLE_COMPONENT_DELIMITER);
            componentName = delimiterIndex > 0 ? attrName.substring(0, delimiterIndex) : attrName;

            // Not a component. Normal set attribute.
            if (!COMPONENTS[componentName]) {
                if (attrName === 'mixin') { this.mixinUpdate(arg1); }
                AFRAME.ANode.prototype.setAttribute.call(this, attrName, arg1);
                return;
            }

            const isInitialized = attrName in this.components;
            const oldAttrValue = this.components[attrName]?.attrValue;

            // Initialize component first if not yet initialized.
            if (!this.components[attrName] && this.hasAttribute(attrName)) {
                this.updateComponent(
                    attrName,
                    window.HTMLElement.prototype.getAttribute.call(this, attrName));
            }

            // Determine new attributes from the arguments
            if (typeof arg2 !== 'undefined' &&
                typeof arg1 === 'string' &&
                arg1.length > 0 &&
                typeof AFRAME.utils.styleParser.parse(arg1) === 'string') {
                // Update a single property of a multi-property component
                for (key in singlePropUpdate) { delete singlePropUpdate[key]; }
                newAttrValue = singlePropUpdate;
                newAttrValue[arg1] = arg2;
                clobber = false;
            } else {
                // Update with a value, object, or CSS-style property string, with the possiblity
                // of clobbering previous values.
                newAttrValue = arg1;
                clobber = (arg2 === true);
            }

            const isEqual = AFRAME.utils.deepEqual(newAttrValue, oldAttrValue);

            // Update component
            this.updateComponent(attrName, newAttrValue, clobber);

            if (this.sceneEl.rootView) {
                if ( !isInitialized || !isEqual ) {
                    this.sceneEl.rootView.setComponentInModel(self.el, attrName, newAttrValue);
                }
            } else {
                console.warn(`multiuser: can't call setComponentInModel, as sceneEl.rootView is not yet set`, self.el, attrName, newAttrValue);
            }

            // In debug mode, write component data up to the DOM.
            isDebugMode = this.sceneEl && this.sceneEl.getAttribute('debug');
            if (isDebugMode) { this.components[attrName].flushToDOM(); }
        };
    },

    remove: function () {

        //TODO: remove component and restore AFrame default behaviour

        // Reflect.defineProperty(this.el,
        //     'setAttribute', {
        //     value: (this.originalSetAttribute)(),
        //     writable: true
        // })

        // this.scene.emit('deleteComponent', { data: this.el.id }, false);

    },

    tick: (function () {   // Uses IIFE to allocate v only once
        const v = new THREE.Vector3();
        const q = new THREE.Quaternion();

        return function (_t, _dt) {
            if (!this.ready) {
                this.scene.emit('add-multiuser', { comp: this }, false);
            } else {
                if (this.cameraEnt) {   // then this.el is the local avatar element
                    try {
                        let cameraObject3D = this.cameraEnt.object3D;
                        v.set(0, 0, 0);
                        cameraObject3D.localToWorld(v);
                        if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
                            this.el.setAttribute('position', structuredClone(v));
                        } else {
                            console.debug(`multiuser: not updating avatar position with NaN:`, v);
                        }

                        q.setFromRotationMatrix(cameraObject3D.matrixWorld);
                        q.multiply(Q.FLIP_Z);
                        if (Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)) {
                            this.el.setAttribute('rotationquaternion', q);
                        } else {
                            console.debug(`multiuser: not updating avatar rotation with NaN:`, rotation);
                        }
                    } catch (err) {
                        console.error("while copying camera position & rotation to avatar:", err);
                    }
                }
            }
        }
    })()
})


function toAFrameValue(attrName, attrValue) {
    switch (attrName) {
        case 'position':
        case 'rotation':
            if ('string' === typeof attrValue && attrValue.length >= 5) {
                return attrValue;
            } else {
                return `${attrValue?.x || 0} ${attrValue?.y || 0} ${attrValue?.z || 0}`;
            }
        case 'scale':
            if ('string' === typeof attrValue && attrValue.length >= 5) {
                return attrValue;
            } else {
                return `${attrValue?.x || 1} ${attrValue?.y || 1} ${attrValue?.z || 1}`;
            }
        case 'rotationquaternion':
            return attrValue;
        case 'material':
            return structuredClone(attrValue);
        default:
            if (attrValue instanceof Object) {
                return AFRAME.utils.styleParser.stringify(attrValue);
            } else {
                return attrValue;
            }
    }
}


/**
 *  Allows *setting* the rotation using a quaternion.
 *  Reading the rotation as a quaternion should still
 *  be done from el.object3D.quaternion.
 */
AFRAME.registerComponent('rotationquaternion', {

    schema: {type: 'vec4'},

    update: function (oldData) {
        // console.debug(`Updating rotationQuaternion from`, oldData, `to:`, this.data);
        if (Number.isFinite(this.data.x) && Number.isFinite(this.data.y) && Number.isFinite(this.data.z) && Number.isFinite(this.data.w)) {
            this.el.object3D.quaternion.copy(this.data);
        } else {
            console.warn(`rotationquaternion: not updating ${this.el.id} with NaN:`, this.data)
        }
    }
});
