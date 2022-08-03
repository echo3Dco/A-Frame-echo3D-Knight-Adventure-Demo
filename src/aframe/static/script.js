AFRAME.registerComponent('bound', {
    schema: {
        avbox: { type: 'selector', default: "#avbox" },
        x1: { type: 'number', default: 0 },
        z1: { type: 'number', default: 0 },
        x2: { type: 'number', default: 0 },
        z2: { type: 'number', default: 0 },
    },
    tick: function () {
        let position = this.data.avbox.object3D.position
        if (position.x < this.data.x1) {
            position.x = this.data.x1
        }
        if (position.x > this.data.x2) {
            position.x = this.data.x2
        }
        if (position.z > this.data.z1) {
            position.z = this.data.z1
        }
        if (position.z < this.data.z2) {
            position.z = this.data.z2
        }
    }
});


AFRAME.registerComponent('movement-animation', {
    schema: {
        target: { type: 'selector', default: "#hud" },
    },
    init: function () {
        this.keyToAnimationClip = {
            'KeyW': "Run",
            'KeyA': "Run",
            'KeyS': "Run",
            'KeyD': "Run",
            'ArrowUp': "Run",
            'ArrowLeft': "Run",
            'ArrowRight': "Run",
            'ArrowDown': "Run"
        }
        document.addEventListener('keydown', (e) => {
            animation = this.data.target.getAttribute("animation-mixer")
            if (animation.clip != 'Idle') {
                return
            }
            if (e.code == 'KeyW' || e.code == 'KeyA' || e.code == 'KeyS' || e.code == 'KeyD'
                || e.code == 'ArrowUp' || e.code == 'ArrowLeft' || e.code == 'ArrowRight' || e.code == 'ArrowDown') {
                this.data.target.setAttribute("animation-mixer", { "clip": this.keyToAnimationClip[e.code] })
            }
        });
        document.addEventListener('keyup', (e) => {
            animation = this.data.target.getAttribute("animation-mixer")
            if (e.code == 'KeyW' || e.code == 'KeyA' || e.code == 'KeyD' || e.code == 'KeyS'
                || e.code == 'ArrowUp' || e.code == 'ArrowLeft' || e.code == 'ArrowRight' || e.code == 'ArrowDown') {
                if (animation.clip == this.keyToAnimationClip[e.code]) {
                    this.data.target.setAttribute("animation-mixer", { "clip": "Idle"})
                }
            }
        })
    }
});

var THREE = window.THREE
var utils = AFRAME.utils
var bind = utils.bind;

// To avoid recalculation at every mouse movement tick
var PI_2 = Math.PI / 2;

/**
 * look-controls. Update entity pose, factoring mouse, touch, and WebVR API data.
 */
AFRAME.registerComponent('rotation-look-control', {
    dependencies: ['position', 'rotation'],

    schema: {
        enabled: { default: true },
        magicWindowTrackingEnabled: { default: true },
        pointerLockEnabled: { default: false },
        reverseMouseDrag: { default: false },
        reverseTouchDrag: { default: false },
        touchEnabled: { default: true },
        mouseEnabled: { default: true }
    },

    init: function () {
        this.deltaYaw = 0;
        this.previousHMDPosition = new THREE.Vector3();
        this.hmdQuaternion = new THREE.Quaternion();
        this.magicWindowAbsoluteEuler = new THREE.Euler();
        this.magicWindowDeltaEuler = new THREE.Euler();
        this.position = new THREE.Vector3();
        this.magicWindowObject = new THREE.Object3D();
        this.rotation = {};
        this.deltaRotation = {};
        this.savedPose = null;
        this.pointerLocked = false;
        this.setupMouseControls();
        this.bindMethods();
        this.previousMouseEvent = {};

        this.setupMagicWindowControls();

        // To save / restore camera pose
        this.savedPose = {
            position: new THREE.Vector3(),
            rotation: new THREE.Euler()
        };

        // Call enter VR handler if the scene has entered VR before the event listeners attached.
        if (this.el.sceneEl.is('vr-mode')) { this.onEnterVR(); }
    },

    setupMagicWindowControls: function () {
        var magicWindowControls;
        var data = this.data;

        // Only on mobile devices and only enabled if DeviceOrientation permission has been granted.
        if (utils.device.isMobile()) {
            magicWindowControls = this.magicWindowControls = new THREE.DeviceOrientationControls(this.magicWindowObject);
            if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
                magicWindowControls.enabled = false;
                if (this.el.sceneEl.components['device-orientation-permission-ui'].permissionGranted) {
                    magicWindowControls.enabled = data.magicWindowTrackingEnabled;
                } else {
                    this.el.sceneEl.addEventListener('deviceorientationpermissiongranted', function () {
                        magicWindowControls.enabled = data.magicWindowTrackingEnabled;
                    });
                }
            }
        }
    },

    update: function (oldData) {
        var data = this.data;

        // Disable grab cursor classes if no longer enabled.
        if (data.enabled !== oldData.enabled) {
            this.updateGrabCursor(data.enabled);
        }

        // Reset magic window eulers if tracking is disabled.
        if (oldData && !data.magicWindowTrackingEnabled && oldData.magicWindowTrackingEnabled) {
            this.magicWindowAbsoluteEuler.set(0, 0, 0);
            this.magicWindowDeltaEuler.set(0, 0, 0);
        }

        // Pass on magic window tracking setting to magicWindowControls.
        if (this.magicWindowControls) {
            this.magicWindowControls.enabled = data.magicWindowTrackingEnabled;
        }

        if (oldData && !data.pointerLockEnabled !== oldData.pointerLockEnabled) {
            this.removeEventListeners();
            this.addEventListeners();
            if (this.pointerLocked) { this.exitPointerLock(); }
        }
    },

    tick: function (t) {
        var data = this.data;
        if (!data.enabled) { return; }
        this.updateOrientation();
    },

    play: function () {
        this.addEventListeners();
    },

    pause: function () {
        this.removeEventListeners();
        if (this.pointerLocked) { this.exitPointerLock(); }
    },

    remove: function () {
        this.removeEventListeners();
        if (this.pointerLocked) { this.exitPointerLock(); }
    },

    bindMethods: function () {
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onMouseMove = bind(this.onMouseMove, this);
        this.onMouseUp = bind(this.onMouseUp, this);
        this.onTouchStart = bind(this.onTouchStart, this);
        this.onTouchMove = bind(this.onTouchMove, this);
        this.onTouchEnd = bind(this.onTouchEnd, this);
        this.onEnterVR = bind(this.onEnterVR, this);
        this.onExitVR = bind(this.onExitVR, this);
        this.onPointerLockChange = bind(this.onPointerLockChange, this);
        this.onPointerLockError = bind(this.onPointerLockError, this);
    },

    /**
     * Set up states and Object3Ds needed to store rotation data.
     */
    setupMouseControls: function () {
        this.mouseDown = false;
        this.pitchObject = new THREE.Object3D();
        this.yawObject = new THREE.Object3D();
        this.yawObject.position.y = 10;
        this.yawObject.add(this.pitchObject);
    },

    /**
     * Add mouse and touch event listeners to canvas.
     */
    addEventListeners: function () {
        var sceneEl = this.el.sceneEl;
        var canvasEl = sceneEl.canvas;

        // Wait for canvas to load.
        if (!canvasEl) {
            sceneEl.addEventListener('render-target-loaded', bind(this.addEventListeners, this));
            return;
        }

        // Mouse events.
        canvasEl.addEventListener('mousedown', this.onMouseDown, false);
        window.addEventListener('mousemove', this.onMouseMove, false);
        window.addEventListener('mouseup', this.onMouseUp, false);

        // Touch events.
        canvasEl.addEventListener('touchstart', this.onTouchStart);
        window.addEventListener('touchmove', this.onTouchMove);
        window.addEventListener('touchend', this.onTouchEnd);

        // sceneEl events.
        sceneEl.addEventListener('enter-vr', this.onEnterVR);
        sceneEl.addEventListener('exit-vr', this.onExitVR);

        // Pointer Lock events.
        if (this.data.pointerLockEnabled) {
            document.addEventListener('pointerlockchange', this.onPointerLockChange, false);
            document.addEventListener('mozpointerlockchange', this.onPointerLockChange, false);
            document.addEventListener('pointerlockerror', this.onPointerLockError, false);
        }
    },

    /**
     * Remove mouse and touch event listeners from canvas.
     */
    removeEventListeners: function () {
        var sceneEl = this.el.sceneEl;
        var canvasEl = sceneEl && sceneEl.canvas;

        if (!canvasEl) { return; }

        // Mouse events.
        canvasEl.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);

        // Touch events.
        canvasEl.removeEventListener('touchstart', this.onTouchStart);
        window.removeEventListener('touchmove', this.onTouchMove);
        window.removeEventListener('touchend', this.onTouchEnd);

        // sceneEl events.
        sceneEl.removeEventListener('enter-vr', this.onEnterVR);
        sceneEl.removeEventListener('exit-vr', this.onExitVR);

        // Pointer Lock events.
        document.removeEventListener('pointerlockchange', this.onPointerLockChange, false);
        document.removeEventListener('mozpointerlockchange', this.onPointerLockChange, false);
        document.removeEventListener('pointerlockerror', this.onPointerLockError, false);
    },

    /**
     * Update orientation for mobile, mouse drag, and headset.
     * Mouse-drag only enabled if HMD is not active.
     */
    updateOrientation: (function () {
        var poseMatrix = new THREE.Matrix4();

        return function () {
            var object3D = this.el.object3D;
            var pitchObject = this.pitchObject;
            var yawObject = this.yawObject;
            var pose;
            var sceneEl = this.el.sceneEl;

            // In VR mode, THREE is in charge of updating the camera pose.
            if (sceneEl.is('vr-mode') && sceneEl.checkHeadsetConnected()) {
                // With WebXR THREE applies headset pose to the object3D matrixWorld internally.
                // Reflect values back on position, rotation, scale for getAttribute to return the expected values.
                if (sceneEl.hasWebXR) {
                    pose = sceneEl.renderer.xr.getCameraPose();
                    if (pose) {
                        poseMatrix.elements = pose.transform.matrix;
                        poseMatrix.decompose(object3D.position, object3D.rotation, object3D.scale);
                    }
                }
                return;
            }

            this.updateMagicWindowOrientation();

            // On mobile, do camera rotation with touch events and sensors.
            //object3D.rotation.x = this.magicWindowDeltaEuler.x + pitchObject.rotation.x;
            object3D.rotation.y = this.magicWindowDeltaEuler.y + yawObject.rotation.y;
            object3D.rotation.z = this.magicWindowDeltaEuler.z;
        };
    })(),

    updateMagicWindowOrientation: function () {
        var magicWindowAbsoluteEuler = this.magicWindowAbsoluteEuler;
        var magicWindowDeltaEuler = this.magicWindowDeltaEuler;
        // Calculate magic window HMD quaternion.
        if (this.magicWindowControls && this.magicWindowControls.enabled) {
            this.magicWindowControls.update();
            magicWindowAbsoluteEuler.setFromQuaternion(this.magicWindowObject.quaternion, 'YXZ');
            if (!this.previousMagicWindowYaw && magicWindowAbsoluteEuler.y !== 0) {
                this.previousMagicWindowYaw = magicWindowAbsoluteEuler.y;
            }
            if (this.previousMagicWindowYaw) {
                magicWindowDeltaEuler.x = magicWindowAbsoluteEuler.x;
                magicWindowDeltaEuler.y += magicWindowAbsoluteEuler.y - this.previousMagicWindowYaw;
                magicWindowDeltaEuler.z = magicWindowAbsoluteEuler.z;
                this.previousMagicWindowYaw = magicWindowAbsoluteEuler.y;
            }
        }
    },

    /**
     * Translate mouse drag into rotation.
     *
     * Dragging up and down rotates the camera around the X-axis (yaw).
     * Dragging left and right rotates the camera around the Y-axis (pitch).
     */
    onMouseMove: function (evt) {
        var direction;
        var movementX;
        var movementY;
        var pitchObject = this.pitchObject;
        var previousMouseEvent = this.previousMouseEvent;
        var yawObject = this.yawObject;

        // Not dragging or not enabled.
        if (!this.data.enabled || (!this.mouseDown && !this.pointerLocked)) { return; }

        // Calculate delta.
        if (this.pointerLocked) {
            movementX = evt.movementX || evt.mozMovementX || 0;
            movementY = evt.movementY || evt.mozMovementY || 0;
        } else {
            movementX = evt.screenX - previousMouseEvent.screenX;
            movementY = evt.screenY - previousMouseEvent.screenY;
        }
        this.previousMouseEvent.screenX = evt.screenX;
        this.previousMouseEvent.screenY = evt.screenY;

        // Calculate rotation.
        direction = this.data.reverseMouseDrag ? 1 : -1;
        yawObject.rotation.y += movementX * 0.002 * direction;
        pitchObject.rotation.x += movementY * 0.002 * direction;
        pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
    },

    /**
     * Register mouse down to detect mouse drag.
     */
    onMouseDown: function (evt) {
        var sceneEl = this.el.sceneEl;
        if (!this.data.enabled || !this.data.mouseEnabled || (sceneEl.is('vr-mode') && sceneEl.checkHeadsetConnected())) { return; }
        // Handle only primary button.
        if (evt.button !== 0) { return; }

        var canvasEl = sceneEl && sceneEl.canvas;

        this.mouseDown = true;
        this.previousMouseEvent.screenX = evt.screenX;
        this.previousMouseEvent.screenY = evt.screenY;
        this.showGrabbingCursor();

        if (this.data.pointerLockEnabled && !this.pointerLocked) {
            if (canvasEl.requestPointerLock) {
                canvasEl.requestPointerLock();
            } else if (canvasEl.mozRequestPointerLock) {
                canvasEl.mozRequestPointerLock();
            }
        }
    },

    /**
     * Shows grabbing cursor on scene
     */
    showGrabbingCursor: function () {
        this.el.sceneEl.canvas.style.cursor = 'grabbing';
    },

    /**
     * Hides grabbing cursor on scene
     */
    hideGrabbingCursor: function () {
        this.el.sceneEl.canvas.style.cursor = '';
    },

    /**
     * Register mouse up to detect release of mouse drag.
     */
    onMouseUp: function () {
        this.mouseDown = false;
        this.hideGrabbingCursor();
    },

    /**
     * Register touch down to detect touch drag.
     */
    onTouchStart: function (evt) {
        if (evt.touches.length !== 1 ||
            !this.data.touchEnabled ||
            this.el.sceneEl.is('vr-mode')) { return; }
        this.touchStart = {
            x: evt.touches[0].pageX,
            y: evt.touches[0].pageY
        };
        this.touchStarted = true;
    },

    /**
     * Translate touch move to Y-axis rotation.
     */
    onTouchMove: function (evt) {
        var direction;
        var canvas = this.el.sceneEl.canvas;
        var deltaY;
        var yawObject = this.yawObject;

        if (!this.touchStarted || !this.data.touchEnabled) { return; }

        deltaY = 2 * Math.PI * (evt.touches[0].pageX - this.touchStart.x) / canvas.clientWidth;

        direction = this.data.reverseTouchDrag ? 1 : -1;
        // Limit touch orientaion to to yaw (y axis).
        yawObject.rotation.y -= deltaY * 0.5 * direction;
        this.touchStart = {
            x: evt.touches[0].pageX,
            y: evt.touches[0].pageY
        };
    },

    /**
     * Register touch end to detect release of touch drag.
     */
    onTouchEnd: function () {
        this.touchStarted = false;
    },

    /**
     * Save pose.
     */
    onEnterVR: function () {
        var sceneEl = this.el.sceneEl;
        if (!sceneEl.checkHeadsetConnected()) { return; }
        this.saveCameraPose();
        this.el.object3D.position.set(0, 0, 0);
        this.el.object3D.rotation.set(0, 0, 0);
        if (sceneEl.hasWebXR) {
            this.el.object3D.matrixAutoUpdate = false;
            this.el.object3D.updateMatrix();
        }
    },

    /**
     * Restore the pose.
     */
    onExitVR: function () {
        if (!this.el.sceneEl.checkHeadsetConnected()) { return; }
        this.restoreCameraPose();
        this.previousHMDPosition.set(0, 0, 0);
        this.el.object3D.matrixAutoUpdate = true;
    },

    /**
     * Update Pointer Lock state.
     */
    onPointerLockChange: function () {
        this.pointerLocked = !!(document.pointerLockElement || document.mozPointerLockElement);
    },

    /**
     * Recover from Pointer Lock error.
     */
    onPointerLockError: function () {
        this.pointerLocked = false;
    },

    // Exits pointer-locked mode.
    exitPointerLock: function () {
        document.exitPointerLock();
        this.pointerLocked = false;
    },

    /**
     * Toggle the feature of showing/hiding the grab cursor.
     */
    updateGrabCursor: function (enabled) {
        var sceneEl = this.el.sceneEl;

        function enableGrabCursor() { sceneEl.canvas.classList.add('a-grab-cursor'); }
        function disableGrabCursor() { sceneEl.canvas.classList.remove('a-grab-cursor'); }

        if (!sceneEl.canvas) {
            if (enabled) {
                sceneEl.addEventListener('render-target-loaded', enableGrabCursor);
            } else {
                sceneEl.addEventListener('render-target-loaded', disableGrabCursor);
            }
            return;
        }

        if (enabled) {
            enableGrabCursor();
            return;
        }
        disableGrabCursor();
    },

    /**
     * Save camera pose before entering VR to restore later if exiting.
     */
    saveCameraPose: function () {
        var el = this.el;

        this.savedPose.position.copy(el.object3D.position);
        this.savedPose.rotation.copy(el.object3D.rotation);
        this.hasSavedPose = true;
    },

    /**
     * Reset camera pose to before entering VR.
     */
    restoreCameraPose: function () {
        var el = this.el;
        var savedPose = this.savedPose;

        if (!this.hasSavedPose) { return; }

        // Reset camera orientation.
        el.object3D.position.copy(savedPose.position);
        el.object3D.rotation.copy(savedPose.rotation);
        this.hasSavedPose = false;
    }
});


/* global AFRAME, THREE */

AFRAME.registerSystem("link-controls", {
    init: function () {
        this.peeking = false;
    }
});

/**
 * Link controls component. Provides the interaction model for links and hand controllers
 * When the user points to the link she can trigger the peek mode on the link to get a 360
 * preview of the linked experience without traversing to it.
 *
 * @member {object} hiddenEls - Stores the hidden elements during peek mode.
 */
AFRAME.registerComponent("link-controls", {
    schema: { hand: { default: "left" } },

    init: function () {
        var el = this.el;
        var self = this;

        el.setAttribute("laser-controls", { hand: this.data.hand });
        el.setAttribute("raycaster", { far: 100, objects: "[link]" });
        // Wait for controller to connect before
        el.addEventListener("controllerconnected", function (evt) {
            var isMobile = AFRAME.utils.device.isMobile();
            var componentName = evt.detail.name;
            var gearVRorDaydream =
                componentName === "daydream-controls" ||
                componentName === "gearvr-controls";
            // Hide second controller for one-controller platforms.
            if (gearVRorDaydream && self.data.hand === "left") {
                self.el.setAttribute("raycaster", "showLine", false);
                return;
            }
            self.controller = componentName;
            self.addControllerEventListeners();
            self.initTooltips();
            if (!isMobile) {
                self.initURLView();
            }
        });
        this.cameraPosition = new THREE.Vector3();
        this.peeking = false;
        this.linkPositionRatio = 0.0;
        this.linkAnimationDuration = 250;
        this.bindMethods();
    },

    tick: function (time, delta) {
        this.animate(delta);
    },

    initURLView: function () {
        var urlEl = (this.urlEl = document.createElement("a-entity"));
        var urlBackgroundEl = (this.urlBackgroundEl = document.createElement(
            "a-entity"
        ));

        // Set text that displays the link title / url
        urlEl.setAttribute("text", {
            color: "white",
            align: "center",
            font: "kelsonsans",
            value: "",
            width: 0.5
        });
        urlEl.setAttribute("position", "0 0.1 -0.25");
        urlEl.setAttribute("visible", false);
        urlBackgroundEl.setAttribute("position", "0 -0.0030 -0.001");
        urlBackgroundEl.setAttribute(
            "slice9",
            "width: 0.5; height: 0.1; left: 32; right: 32; top: 64; bottom: 32; src: images/tooltip.png"
        );
        urlBackgroundEl.setAttribute("scale", "1 0.5 1");
        urlEl.appendChild(urlBackgroundEl);
        this.el.appendChild(urlEl);
    },

    tooltips: {
        "vive-controls": {
            left: {
                touchpad: {
                    tooltip:
                        "text: Press and hold touchpad to peek link; width: 0.1; height: 0.04; targetPosition: 0 0.05 0",
                    position: "0.1 0.05 0.048",
                    rotation: "-90 0 0"
                },
                trigger: {
                    tooltip:
                        "text: Press trigger to traverse link; width: 0.11; height: 0.04; targetPosition: 0 -0.06 0.06; lineHorizontalAlign: right;",
                    position: "-0.11 -0.055 0.04",
                    rotation: "-90 0 0"
                }
            },
            right: {
                touchpad: {
                    tooltip:
                        "text: Press and hold touchpad to peek link; width: 0.1; height: 0.04; targetPosition: 0 0.05 0",
                    position: "0.1 0.05 0.048",
                    rotation: "-90 0 0"
                },
                trigger: {
                    tooltip:
                        "text: Press trigger to traverse link; width: 0.11; height: 0.04; targetPosition: 0 -0.06 0.06; lineHorizontalAlign: right;",
                    position: "-0.11 -0.055 0.04",
                    rotation: "-90 0 0"
                }
            }
        },
        "oculus-touch-controls": {
            left: {
                xbutton: {
                    tooltip:
                        "text: Press X to peek link; width: 0.1; height: 0.04; targetPosition: 0.01 0.05 0",
                    position: "0.09 0.055 0.050",
                    rotation: "-90 0 0"
                },
                trigger: {
                    tooltip:
                        "text: Press trigger to traverse link; width: 0.11; height: 0.04; targetPosition: 0.01 -0.06 0.06; lineHorizontalAlign: right;",
                    position: "-0.13 -0.055 0.04",
                    rotation: "-90 0 0"
                }
            },
            right: {
                abutton: {
                    tooltip:
                        "text: Press A to peek link; width: 0.1; height: 0.04; targetPosition: -0.01 0.05 0",
                    position: "0.09 0.055 0.050",
                    rotation: "-90 0 0"
                },
                trigger: {
                    tooltip:
                        "text: Press trigger to traverse link; width: 0.11; height: 0.04; targetPosition: -0.005 -0.06 0.06; lineHorizontalAlign: right;",
                    position: "-0.11 -0.055 0.04",
                    rotation: "-90 0 0"
                }
            }
        },
        "daydream-controls": {
            touchpad: {
                tooltip:
                    "text: Touch to peek, click to traverse link; width: 0.11; height: 0.04; targetPosition: -0.005 -0.06 0.06; lineHorizontalAlign: right;",
                position: "-0.11 -0.055 0.04",
                rotation: "-90 0 0"
            }
        },
        "gearvr-controls": {
            touchpad: {
                tooltip:
                    "text: Touch to peek, click to traverse link; width: 0.11; height: 0.04; targetPosition: -0.005 -0.06 0.06; lineHorizontalAlign: right;",
                position: "-0.11 -0.055 0.04",
                rotation: "-90 0 0"
            }
        }
    },

    initTooltips: function () {
        var controllerTooltips;
        var tooltips = this.tooltips;
        var el = this.el;
        if (!this.controller) {
            return;
        }
        var hand = el.getAttribute(this.controller).hand;
        controllerTooltips = hand
            ? tooltips[this.controller][hand]
            : tooltips[this.controller];
        Object.keys(controllerTooltips).forEach(function (key) {
            var tooltip = controllerTooltips[key];
            var tooltipEl = document.createElement("a-entity");
            tooltipEl.setAttribute("tooltip", tooltip.tooltip);
            tooltipEl.setAttribute("position", tooltip.position);
            tooltipEl.setAttribute("rotation", tooltip.rotation);
            el.appendChild(tooltipEl);
        });
    },

    bindMethods: function () {
        this.onMouseEnter = this.onMouseEnter.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.startPeeking = this.startPeeking.bind(this);
        this.stopPeeking = this.stopPeeking.bind(this);
    },

    play: function () {
        var sceneEl = this.el.sceneEl;
        sceneEl.addEventListener("mouseenter", this.onMouseEnter);
        sceneEl.addEventListener("mouseleave", this.onMouseLeave);
        this.addControllerEventListeners();
    },

    pause: function () {
        var sceneEl = this.el.sceneEl;
        sceneEl.removeEventListener("mouseenter", this.onMouseEnter);
        sceneEl.removeEventListener("mouseleave", this.onMouseLeave);
        this.removeControllerEventListeners();
    },

    addControllerEventListeners: function () {
        var el = this.el;
        if (!this.controller) {
            return;
        }
        switch (this.controller) {
            case "vive-controls":
                el.addEventListener("trackpaddown", this.startPeeking);
                el.addEventListener("trackpadup", this.stopPeeking);
                break;
            case "daydream-controls":
                el.addEventListener("trackpadtouchstart", this.startPeeking);
                el.addEventListener("trackpadtouchend", this.stopPeeking);
                break;
            case "oculus-touch-controls":
                el.addEventListener("xbuttondown", this.startPeeking);
                el.addEventListener("xbuttonup", this.stopPeeking);
                el.addEventListener("abuttondown", this.startPeeking);
                el.addEventListener("abuttonup", this.stopPeeking);
                break;
            case "gearvr-controls":
                el.addEventListener("trackpadtouchstart", this.startPeeking);
                el.addEventListener("trackpadtouchend", this.stopPeeking);
                break;
            default:
                console.warn(
                    "Unknown controller " +
                    this.controller +
                    ". Cannot attach link event listeners."
                );
        }
    },

    removeControllerEventListeners: function () {
        var el = this.el;
        switch (!this.controller) {
            case "vive-controls":
                el.removeEventListeners("trackpaddown", this.startPeeking);
                el.removeEventListeners("trackpadup", this.stopPeeking);
                break;
            case "daydream-controls":
                el.removeEventListeners("trackpadtouchstart", this.startPeeking);
                el.removeEventListeners("trackpadtouchend", this.stopPeeking);
                break;
            case "oculus-touch-controls":
                el.removeEventListener("xbuttondown", this.startPeeking);
                el.removeEventListener("xbuttonup", this.stopPeeking);
                el.removeEventListener("abuttondown", this.startPeeking);
                el.removeEventListener("abuttonup", this.stopPeeking);
                break;
            case "gearvr-controls":
                el.removeEventListener("trackpadtouchstart", this.startPeeking);
                el.removeEventListener("trackpadtouchend", this.stopPeeking);
                break;
            default:
                console.warn(
                    "Unknown controller " +
                    this.controller +
                    ". Cannot remove link event listeners."
                );
        }
    },

    startPeeking: function () {
        var selectedLinkEl = this.selectedLinkEl;
        if (!selectedLinkEl || this.system.peeking || this.animatedEl) {
            return;
        }
        this.peeking = true;
        this.system.peeking = true;
        this.animatedEl = selectedLinkEl;
        this.animatedElInitPosition = selectedLinkEl.getAttribute("position");
        this.updateCameraPosition();
    },

    stopPeeking: function () {
        this.peeking = false;
        this.system.peeking = false;
    },

    updateCameraPosition: function () {
        var camera = this.el.sceneEl.camera;
        camera.parent.updateMatrixWorld();
        camera.updateMatrixWorld();
        this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    },

    animate: (function () {
        var linkPosition = new THREE.Vector3();
        var portalToCameraVector = new THREE.Vector3();
        var easeOutCubic = function (t) {
            return --t * t * t + 1;
        };
        return function (delta) {
            var animatedEl = this.animatedEl;
            // There's no element to animate.
            if (!animatedEl) {
                return;
            }
            // User is not peeking and animation reached the end
            if (!this.peeking && this.linkPositionRatio === 0.0) {
                // Restore portal initial position after animation
                animatedEl.setAttribute("position", this.animatedElInitPosition);
                // Exit peekmode and show all the elements in the scene
                animatedEl.setAttribute("link", "peekMode", false);
                animatedEl.components.link.showAll();
                // We're done with the animation
                this.animatedEl = undefined;
                return;
            }
            // If we're peeking and the animation towards the camera has finished
            if (this.peeking && this.linkPositionRatio === 1.0) {
                animatedEl.setAttribute("link", "peekMode", true);
            } else {
                // Hide all elements during animation to avoid clipping artifacts
                animatedEl.components.link.hideAll();
            }
            // Calculate animation step
            var step = delta / this.linkAnimationDuration;
            // From [0..1] progress of the animation
            this.linkPositionRatio += this.peeking ? step : -step;
            // clamp to [0,1]
            this.linkPositionRatio = Math.min(
                Math.max(0.0, this.linkPositionRatio),
                1.0
            );
            // Update Portal Position
            linkPosition.copy(this.animatedElInitPosition);
            // Move link towards the camera: Camera <----- Link
            portalToCameraVector.copy(this.cameraPosition).sub(linkPosition);
            var distanceToCamera = portalToCameraVector.length();
            // Unit vector
            portalToCameraVector.normalize();
            portalToCameraVector.multiplyScalar(
                distanceToCamera * easeOutCubic(this.linkPositionRatio)
            );
            // Adds direction vector to the
            linkPosition.add(portalToCameraVector);
            // Hides / Shows link URL to prevent jarring animation when moving
            // the portal towards the user
            if (this.linkPositionRatio > 0.0 && this.linkPositionRatio < 1.0) {
                animatedEl.components.link.textEl.setAttribute("visible", false);
            } else {
                animatedEl.components.link.textEl.setAttribute("visible", true);
            }
            // We won't move the portal closer than 0.5m from the user.
            if (distanceToCamera <= 0.5 && this.peeking) {
                return;
            }
            // Update portal position
            animatedEl.setAttribute("position", linkPosition);
        };
    })(),

    onMouseEnter: function (evt) {
        var link;
        var previousSelectedLinkEl = this.selectedLinkEl;
        var selectedLinkEl = evt.detail.intersectedEl;
        var urlEl = this.urlEl;
        if (
            !selectedLinkEl ||
            previousSelectedLinkEl ||
            selectedLinkEl.components.link === undefined
        ) {
            return;
        }
        selectedLinkEl.setAttribute("link", "highlighted", true);
        this.selectedLinkElPosition = selectedLinkEl.getAttribute("position");
        this.selectedLinkEl = selectedLinkEl;
        if (!urlEl) {
            return;
        }
        link = selectedLinkEl.getAttribute("link");
        urlEl.setAttribute("text", "value", link.title || link.href);
        urlEl.setAttribute("visible", true);
    },

    onMouseLeave: function (evt) {
        var selectedLinkEl = this.selectedLinkEl;
        var urlEl = this.urlEl;
        if (!selectedLinkEl || !evt.detail.intersectedEl) {
            return;
        }
        selectedLinkEl.setAttribute("link", "highlighted", false);
        this.selectedLinkEl = undefined;
        if (!urlEl) {
            return;
        }
        urlEl.setAttribute("visible", false);
    }
});



AFRAME.registerComponent('collision-handler', {
    schema: {
        parent: { type: 'selector', default: "#my_scene" },
        scoreboard: { type: 'selector', default: "#scoreboard" },
        avatar: { type: 'selector', default: "#avatar" }
    },

    init: function () {
        this.collisionHandler = (e) => {
            this.otherElement = e.detail.body.el
        }
        this.el.addEventListener('collide', this.collisionHandler);
    },
    tick: function () {
        if (this.otherElement != null && this.otherElement != undefined) {
            if (this.otherElement.getAttribute("id") == "reward") {
                this.otherElement.removeAttribute("geometry")
                this.otherElement.removeAttribute("dynamic-body")
                this.data.parent.removeChild(this.otherElement)
                window.location.replace("/gameover");
                this.data.parent.destroy();
                this.otherElement = null;
            } else {
                this.otherElement.removeAttribute("geometry")
                this.otherElement.removeAttribute("dynamic-body")
                this.data.parent.removeChild(this.otherElement)
                this.data.avatar.emit("healthUpdate", { deltaHealth: -1 });
                this.data.scoreboard.setAttribute('text', 'value', "Health -1")
                setTimeout(() => {
                    this.data.scoreboard.setAttribute("text", "value", "")
                }, 500)
                this.otherElement = null

                if (now_health < 1) {
                    alert("You lose! Let's start over again.");
                    window.location.replace("/");
                }
            }
        }
    }
})

AFRAME.registerComponent('scorekeeper', {
    schema: {
        target: { type: 'selector', default: "#hud" },
    },


    init: function () {

        // this.gameOver = false;
        // this.valueStorage = ValueStorage;

        this.data.target.setAttribute('text', 'value', 'Health ' + now_health);

        this.el.addEventListener("healthUpdate", (event) => {
            now_health += event.detail.deltaHealth;
            this.data.target.setAttribute('text', 'value', 'Health ' + now_health);
        });
        // this.timer = setInterval(()=>{ this.el.emit("timeleftUpdate") }, 1000);
    }
});
