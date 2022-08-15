const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const { Engine, Runner, Body,
  Vertices, Events, Bodies, Composite } = require('matter-js');

// create an engine
const engine = Engine.create(),
  world = engine.world;
const runner = Runner.create();
Runner.run(runner, engine);

// add walls
Composite.add(world, [
  Bodies.rectangle(400, 0 - 25, 800, 50, { isStatic: true }),
  Bodies.rectangle(400, 1000 + 25, 800, 50, { isStatic: true }),
  Bodies.rectangle(800 + 25, 500, 50, 1000, { isStatic: true }),
  Bodies.rectangle(0 - 25, 500, 50, 1000, { isStatic: true })
]);

// add player composite
const players = Composite.create();
Composite.add(world, players);

const socketIds = new Map();

io.on('connection', socket => {

  // add player
  const arrow = Vertices.fromPath('0 80 20 0 40 80');
  const player = Bodies.fromVertices(400, 100, arrow, { mass: 0.5, friction: 0.01 });
  player.health = 100;
  player.kills = 0;
  player.controls = { translate: false, rotate: false };
  Composite.add(players, player);

  socketIds.set(player.id, socket.id) // save socketId

  socket.emit('id', player.id); // send id

  // listen for input
  socket.on('input', code => {
    switch (code) {
      case 't': player.controls.translate = true; break;
      case 'T': player.controls.translate = false; break;
      case 'r': player.controls.rotate = true; break;
      case 'R': player.controls.rotate = false; break;
    }
  });

  // move players according to controls
  Events.on(engine, 'beforeUpdate', () => {
    const {translate, rotate} = player.controls;

    if (rotate) player.torque = 0.05;

    if (translate) player.force = {
      x: 0.0015 * Math.sin(player.angle),
      y: -0.0015 * Math.cos(player.angle)
    };
  });

  socket.on('disconnect', () => {
    Composite.remove(players, player); // remove player from players
    socketIds.delete(player.id) // forget socket.id
  });

  socket.on('ping', callback => callback());
});

// emit regular updates to clients
setInterval(() => {

  let gamestate = players.bodies.map(body => ({
    i: body.id,
    x: Math.round(body.position.x),
    y: Math.round(body.position.y),
    r: Math.round(body.angle * 100) / 100,
  })); // instead of round use sigfig function

  io.volatile.emit('update', gamestate);

}, 1000 / 30);

// listen for collisions
Events.on(engine, "collisionStart", ({ pairs }) => {
  
  for (const {bodyA, bodyB, activeContacts, collision} of pairs) {

    // both bodies must be players
    if (!bodyA.controls || !bodyB.controls) continue;

    // must be a stab with nose
    if (activeContacts.length != 1) continue;
    const { vertex } = activeContacts[0];
    if (vertex.index != 0) continue;

    // identify attacker and victim
    const attacker = vertex.body;
    const victim = attacker === bodyA ? bodyB : bodyA;

    if (victim.shielded) return; // return if shieled

    // compute damage
    const damage = Math.round(collision.depth * 5);

    // decrement victim health
    victim.health -= damage;

    // give victim 1 second sheild
    victim.shielded = true;
    setTimeout(() => victim.shielded = false, 1000);

    // emit 'strike' with damage dealt and position
    io.to(socketIds.get(attacker.id)).emit('strike', damage, vertex.x, vertex.y);

    // check if dead
    if (victim.health <= 0) {
      victim.health = 100;
      Body.setPosition(victim, { x: 400, y: 100 });
    }

    // emit 'injury' with new health
    io.to(socketIds.get(victim.id)).emit('injury', victim.health);
  }

});

http.listen(port, () => console.log(`Listening on port ${port}`));
