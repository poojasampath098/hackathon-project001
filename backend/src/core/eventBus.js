const EventEmitter = require("events");

const bus = new EventEmitter();
bus.setMaxListeners(100);

function emitActivity(activity) {
  bus.emit("activity", activity);
}

function onActivity(callback) {
  bus.on("activity", callback);
}

function offActivity(callback) {
  bus.removeListener("activity", callback);
}

module.exports = { emitActivity, onActivity, offActivity, _bus: bus };
