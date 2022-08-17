// module aliases
const Engine = Matter.Engine,
  Render = Matter.Render,
  Runner = Matter.Runner,
  Bodies = Matter.Bodies,
  Composite = Matter.Composite,
  Body = Matter.Body,
  Vertices = Matter.Vertices,
  Events = Matter.Events;

const socket = io(); // connect to server

let myId;
socket.on('id', id => myId = id); // save id

// create engine
const engine = Engine.create(),
  world = engine.world;

let explosion = null;

// update world.bodies according to gamestate
socket.on('update', ({p, b}) => {
  for (const { i, x, y, r } of p) {

    let player = world.bodies.find(body => body.id === i);
    
    // add player if not already in bodies
    if (!player) {
      const arrow = Vertices.fromPath('0 80 20 0 40 80');
      player = Bodies.fromVertices(0, 0, arrow, { id: i });
      player.render.fillStyle = (player.id === myId) ? '#27c' : '#567';
      Composite.add(world, player);
    }

    // update player per gamestate
    Body.setPosition(player, { x, y });
    Body.setAngle(player, r);
  }

  for (const { i, x, y } of b) {

    let bomb = world.bodies.find(body => body.id === i);
    
    // add bomb if not already in bodies
    if (!bomb) {
      bomb = Bodies.circle(0, 0, 16, { id: i });
      bomb.startTime = Date.now();
      Composite.add(world, bomb);
    }

    // update bomb per gamestate
    Body.setPosition(bomb, { x, y });

    // update bomb color relative to its startTime
    const dt = (Date.now() - bomb.startTime) / 1000;
    const hue = 120 - 120 * dt / 3;
    const lightness = 40 + 24 * dt / 3;
    bomb.render.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
  }

  // remove absent bodies
  // (that is, remove world bodies not found in gamestate)
  world.bodies.forEach(body => {
    const foundInGamestate = p.concat(b).find(({ i }) => i === body.id);
    if (!foundInGamestate) {
      Composite.remove(world, [body]);
      if (body.vertices.length > 3) { // if a bomb was removed
        explosion = {x: body.position.x, y: body.position.y, opacity: 100};
      }
    }
  });
});

// create renderer
var render = Render.create({
  element: document.body,
  engine: engine,
  options: { wireframes: false, height: 800 },
});
Render.run(render);

// display ping

let ping = 0;
setInterval(() => {
  const start = Date.now();
  socket.volatile.emit('ping', () => {
    ping = Date.now() - start;
  });
}, 1000);

Events.on(render, 'afterRender', () => {
  render.context.fillStyle = '#778899bb';
  render.context.font = "26px Arial";
  render.context.textBaseline = 'top';
  render.context.textAlign = 'right';
  render.context.fillText(`${ping} ping`, 800 - 10, 10);
});

// configure controls to send input

const controls = document.createElement('section');
const left = document.createElement('button');
const right = document.createElement('button');
const shoot = document.createElement('button');
const translate = document.createElement('button');

left.textContent = 'l';
right.textContent = 'r';
shoot.textContent = 's';
translate.textContent = 't';

document.body.appendChild(controls);
[left, right, shoot, translate].forEach(control => {
  controls.appendChild(control);
  control.onpointerdown = e => input(e, true);
  control.onpointerup = e => input(e, false);
});

function input(e, down) {
  e.target.style.opacity = down ? 0.5 : 1;
  let code = e.target.textContent;
  if (!down) code = code.toUpperCase();
  if (code === 'S') return;
  socket.volatile.emit('input', code);
}

// listen for injury

const healthBar = document.createElement('nav');
document.body.prepend(healthBar);
healthBar.textContent = healthBar.style.width = '100%';

socket.on('injury', health => {
  healthBar.textContent = healthBar.style.width = `${health}%`;
});

// listen for strike

let damageIndicators = [];

socket.on('strike', (damage, positions) => {
  positions.forEach(({x, y}) => {
    damageIndicators.push({damage, x, y, opacity: 300});
  });
});

// render damageIndicators
Events.on(render, "afterRender", () => {
  const ctx = render.context;

  for (const d of damageIndicators) {

    // draw damage
    ctx.font = "bold 36px system-ui";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = `rgba(0,0,0,${d.opacity / 100})`;
    ctx.fillStyle = `rgba(255,169,64,${d.opacity / 100})`;
    ctx.fillText(`${d.damage}`, d.x, d.y);

    // decrement opacity
    d.opacity -= 5;
  }
  
  damageIndicators = damageIndicators.filter(d => d.opacity > 0);
});

// render explosion
Events.on(render, "afterRender", () => {
  if (!explosion) return;

  const ctx = render.context;

  ctx.strokeStyle = `rgba(119,136,153,${explosion.opacity / 100})`;
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, 100, 0, 2*Math.PI);
  ctx.stroke();

  // decrement opacity
  explosion.opacity -= Math.floor(explosion.opacity / 8) + 1;

  if (explosion.opacity <= 0) explosion = null;
});
