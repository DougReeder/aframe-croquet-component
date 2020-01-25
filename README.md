## A-Frame multi-user Croquet component 

The component allows easily, while staying in [A-Frame](https://aframe.io) scene definition (plain HTML file), to add a multi-user features onto A-Frame entities in scene. Create [Croquet](https://croquet.studio) (aka Croquet V) simulations on A-Frame entities.  
A-Frame multi-user component works by synchronizing / replicating entities and their components to connected peers using Croquet application architecture. It relies on public Croquet reflectors, which are avaliable online on the Internet.  

[source code](./public/lib/aframe-croquet-component.js)

<img src="https://krestianstvo.org/sdk/projects/aframe-croquet-component/docs/screen480.gif" width="400">  

[Demo video](https://vimeo.com/387187875)

Getting Started
---------------

### How to share an entity in an A-Frame scene with other users:  

Add links to this component and croquet lib in the html header

```html
<script src="https://croquet.studio/sdk/croquet-latest.min.js"></script>
<script src="https://unpkg.com/aframe-croquet-component/public/lib/aframe-croquet-component.js"></script>
```

Add `croquet` component to the root <a-scene> element and give a name to the Croquet session

```html
<a-scene croquet="sessionName: demo-scene">
```

Give an `id` to the entity (if not exist) and finally add `multiuser` component

```html
 <a-box id="box1" position="-1.5 1 -3" rotation="0 45 0" color="#4CC3D9" multiuser></a-box>
``` 

Open the same scene in several Web Browsers windows. The entity should be synced!


### How to try out the synchronization:

Open Web Browser Developer Tools and select an entity with `multiuser` component
```js
let box = document.querySelector('a-scene').querySelector('#box1')
```  
Change entity attributes like, position, rotation, geometry or material etc., by replicating the entity properties
```js
box.setAttribute('position', {x:0, y: 1, z: -4});
box.setAttribute('rotation', {x:0, y: 45, z: 0});
box.setAttribute('material', {color: '#4BAC41'});
box.setAttribute('geometry', {width: 3});
```  
Start a Croquet application attached to an entity, by replicating a computation (animation example)
```js
box.setAttribute('multiuser', {anim: true});
```

Also you could try to attach to scene the [A-Frame scene Inspector](https://github.com/aframevr/aframe-inspector) by pressing ```<ctrl> + <alt> + i```. Modify entity properties within it's GUI and observe how some of the properties replicates on other peers.


Basic Scene Example
-------------
[source code](./public/index.html)

```html
<html>
<head>
  <title>A-Frame & Croquet</title>
  <script src="https://croquet.studio/sdk/croquet-latest.min.js"></script>
  <script src="https://aframe.io/releases/1.0.3/aframe.min.js"></script>
  <script src="https://unpkg.com/aframe-croquet-component/public/lib/aframe-croquet-component.js"></script>
</head>
<body>
  <a-scene croquet="sessionName: demo-scene">
    <a-box id="box1" position="-1.5 1 -3" rotation="0 45 0" color="#4CC3D9" multiuser="anim: true"></a-box>
    <a-sphere id="sphere1" position="0 1.25 -5" radius="1.25" color="#EF2D5E" multiuser></a-sphere>
    <a-cylinder id="cylinder1" position="1 0.75 -3" radius="0.5" height="1.5" color="#FFC65D"></a-cylinder>
    <a-plane id="plane1" position="0 0 -4" rotation="-90 0 0" width="4" height="4" color="#7BC8A4" multiuser></a-plane>
    <a-sky color="#ECECEC"></a-sky>
  </a-scene>
</body>
</html>
```
