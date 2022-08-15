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

// update world.bodies according to gamestate
socket.on('update', gs => {
  for (const { i, x, y, r } of gs) {

    let player = world.bodies.find(body => body.id === i);
    
    // add player if not already in bodies
    if (!player) {
      const arrow = Vertices.fromPath('0 80 20 0 40 80');
      player = Bodies.fromVertices(500, 100, arrow, { id: i });
      player.render.fillStyle = (player.id === myId) ? '#27c' : '#567';
      Composite.add(world, player);
    }

    // update player per gamestate
    Body.setPosition(player, { x, y });
    Body.setAngle(player, r);
  }

  // remove absent players
  world.bodies.forEach(body => {
    const player = gs.find(({ i }) => i === body.id);
    if (!player) Composite.remove(world, [body])
  });
});

// create renderer
var render = Render.create({
  element: document.body,
  engine: engine,
  options: { wireframes: false, height: 1000 },
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

Events.on(render, "afterRender", () => {
  render.context.fillStyle = '#778899bb';
  render.context.font = "26px Arial";
  render.context.textBaseline = 'top';
  render.context.textAlign = 'right';
  render.context.fillText(`${ping} ping`, 800 - 10, 10);
});

// configure controls to send input

const controls = document.createElement('section');
const rotate = document.createElement('button');
const translate = document.createElement('button');

rotate.textContent = 'rotate';
translate.textContent = 'translate';

document.body.appendChild(controls);
controls.appendChild(rotate);
controls.appendChild(translate);

translate.onpointerdown = rotate.onpointerdown = (e) => input(e, true);
translate.onpointerup = rotate.onpointerup = (e) => input(e, false);

function input(e, down) {
  e.target.style.opacity = down ? 0.5 : 1;
  let code = e.target.textContent === 'translate' ? 't' : 'r';
  if (!down) code = code.toUpperCase();
  socket.volatile.emit('input', code);
}

// listen for injury

const healthBar = document.createElement('nav');
document.body.prepend(healthBar);
healthBar.textContent = healthBar.style.width = '100%';

socket.on('injury', health => {
  console.log(`health: ${health}`);
  healthBar.textContent = healthBar.style.width = `${health}%`;
});

// listen for strike

let damageIndicators = [];

socket.on('strike', (damage, x, y) => {
  damageIndicators.push({damage, x, y, opacity: 300});
});

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
    // ctx.strokeText(`${d.damage}`, d.x, d.y);
    ctx.fillText(`${d.damage}`, d.x, d.y);

    // decrement opacity
    d.opacity -= 5;
  }
  
  damageIndicators = damageIndicators.filter(d => d.opacity > 0);
});
