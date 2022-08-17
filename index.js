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
  Bodies.rectangle(400, 800 + 25, 800, 50, { isStatic: true }),
  Bodies.rectangle(800 + 25, 400, 50, 800, { isStatic: true }),
  Bodies.rectangle(0 - 25, 400, 50, 800, { isStatic: true })
]);

// add player composite
const players = Composite.create();
Composite.add(world, players);

// add bombs composite
const bombs = Composite.create();
Composite.add(world, bombs);

const socketIds = new Map();

io.on('connection', socket => {

  // add player
  const arrow = Vertices.fromPath('0 80 20 0 40 80');
  const player = Bodies.fromVertices(400, 100, arrow, { mass: 0.5, friction: 0.01 });
  player.health = 100;
  player.kills = 0;
  player.controls = {};
  player.shoot = shoot;
  player.hasBomb = true;
  Composite.add(players, player);

  socketIds.set(player.id, socket.id) // save socketId

  socket.emit('id', player.id); // send id

  // listen for input
  socket.on('input', code => {
    if (code === 's') {
      player.shoot();
      return;
    }
    const control = code.toLowerCase();
    const active = control === code;
    player.controls[control] = active;
  });

  // move players according to controls
  Events.on(engine, 'beforeUpdate', () => {
    const {l, r, t} = player.controls;

    if (l) player.torque = -0.04;
    if (r) player.torque = 0.04;

    if (t) player.force = {
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

  let p = players.bodies.map(body => ({
    i: body.id,
    x: Math.round(body.position.x),
    y: Math.round(body.position.y),
    r: Math.round(body.angle * 100) / 100,
  }));

  let b = bombs.bodies.map(body => ({
    i: body.id,
    x: Math.round(body.position.x),
    y: Math.round(body.position.y),
  }));

  // TODO: 👆 instead of round use sigfig function

  const gamestate = {p, b};

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

    if (victim.shielded) return; // return if shielded

    // give victim 1 second sheild
    // NOTE: shield only protects from stab, not bomb
    victim.shielded = true;
    setTimeout(() => victim.shielded = false, 1000);

    // compute damage
    const damage = Math.round(collision.depth * 5);

    strike(attacker, damage, [{ x: vertex.x, y: vertex.y }]);

    injury(victim, damage);
  }

});

function shoot() {
  if (!this.hasBomb) return;
  const options = {
    mass: 0.01,
    restitution: 0.95,
    frictionAir: 0.01,
    position: {
      x: this.position.x + 70 * Math.sin(this.angle),
      y: this.position.y - 70 * Math.cos(this.angle)
    }
  };
  const bomb = Bodies.circle(400, 100, 16, options);
  Composite.add(bombs, bomb);
  Body.setVelocity(bomb, {
    x: 20 * Math.sin(this.angle),
    y: -20 * Math.cos(this.angle)
  })
  this.hasBomb = false;
  setTimeout(() => {
    // get players within explosion radius
    const victims = players.bodies.filter(player => {
      // return true if distance from player to bomb
      // is less than 100
      const dx = bomb.position.x - player.position.x;
      const dy = bomb.position.y - player.position.y;
      const distance = Math.hypot(dx, dy);
      return distance < 100;
    });
    positions = victims.map(victim => victim.position);
    const damage = 20;
    strike(this, damage, positions);
    victims.forEach(victim => injury(victim, damage));
    Composite.remove(bombs, bomb);
    this.hasBomb = true;
  }, 3000);
}

function strike(player, amount, positions) {
  // emit 'strike' with damage dealt and position
  io.to(socketIds.get(player.id)).emit('strike', amount, positions);
}

function injury(player, amount) {
  // decrement victim health
  player.health -= amount;

  // check if dead
  if (player.health <= 0) {
    player.health = 100;
    Body.setPosition(player, { x: 400, y: 100 });
  }

  // emit 'injury' with new health
  io.to(socketIds.get(player.id)).emit('injury', player.health);
}

http.listen(port, () => console.log(`Listening on port ${port}`));
