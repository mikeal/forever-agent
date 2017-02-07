module.exports = ForeverAgent
ForeverAgent.SSL = ForeverAgentSSL

var util = require('util');
var net  = require('net');
var tls  = require('tls');

var Agent    = require('http').Agent;
var AgentSSL = require('https').Agent;


function getConnectionName(host, port) {
  if (typeof host === 'string') {
    return host + ':' + port;
  } else {
    // For node.js v012.0 and iojs-v1.5.1, host is an object. And any existing localAddress is part of the connection name.
    return host.host + ':' + host.port + ':' + (host.localAddress ? (host.localAddress + ':') : ':');
  }
}

// We need to get data list from { name1 : [data1, data2], ... }
function getDataList(obj) {
  return Object.keys(obj).reduce(function (list, name) {
    return list.concat(obj[name]);
  }, []);
}

function ForeverAgent(options) {
  var self = this;

  self.options = options || {};

  self.maxSockets = self.options.maxSockets || Agent.defaultMaxSockets;
  self.minSockets = self.options.minSockets || ForeverAgent.defaultMinSockets;

  self.requests    = {};
  self.sockets     = {};
  self.freeSockets = {};

  self.on('free', function(socket, host, port) {
    // Ignore destroyed sockets
    if (!socket.writable) {
      return;
    }

    var name = getConnectionName(host, port);
    var requests = self.requests[name];
    var sockets  = self.sockets[name];

    if (requests && requests.length > 0) {
      requests.shift().onSocket(socket);
    } else if (sockets && sockets.length < self.minSockets) {
      var freeSockets = self.freeSockets[name];
      if (!freeSockets) {
        self.freeSockets[name] = freeSockets = [];
      }
      freeSockets.push(socket);

      // if an error happens while we don't use the socket anyway, meh, throw the socket away
      var onIdleError = function() {
        socket.destroy();
      }
      socket._onIdleError = onIdleError;
      socket.on('error', onIdleError);
    } else {
      // If there are no pending requests just destroy the
      // socket and it will get removed from the pool. This
      // gets us out of timeout issues and allows us to
      // default to Connection:keep-alive.
      socket.destroy();
    }
  });
}
util.inherits(ForeverAgent, Agent);

ForeverAgent.defaultMinSockets = 5;


ForeverAgent.prototype.createConnection = net.createConnection;
ForeverAgent.prototype.addRequestNoreuse = Agent.prototype.addRequest;
ForeverAgent.prototype.addRequest = function(req, host, port) {
  var name = getConnectionName(host, port);
  
  if (typeof host !== 'string') {
    var options = host;
    port = options.port;
    host = options.host;
  }

  var freeSockets = this.freeSockets[name];
  if (freeSockets && freeSockets.length > 0 && !req.useChunkedEncodingByDefault) {
    var idleSocket = freeSockets.pop();
    idleSocket.removeListener('error', idleSocket._onIdleError);
    delete idleSocket._onIdleError;
    req._reusedSocket = true;
    req.onSocket(idleSocket);
  } else {
    this.addRequestNoreuse(req, host, port);
  }
}

ForeverAgent.prototype.removeSocket = function(s, name, host, port) {
  var sockets = this.sockets[name];
  if (sockets) {
    var index = this.sockets[name].indexOf(s);
    if (index !== -1) {
      sockets.splice(index, 1);
      if (sockets.length === 0) {
        delete this.sockets[name];
        delete this.requests[name];
      }
    }
  }

  var freeSockets = this.freeSockets[name];
  if (freeSockets) {
    var index = freeSockets.indexOf(s);
    if (index !== -1) {
      freeSockets.splice(index, 1);
      if (freeSockets.length === 0) {
        delete this.freeSockets[name];
      }
    }
  }

  var requests = this.requests[name];
  if (requests && requests.length > 0) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createSocket(name, host, port).emit('free');
  }
}

ForeverAgent.prototype.destroy = function() {
  getDataList(this.requests).forEach(function (request) {
    request.abort();
  });

  getDataList(this.sockets)
    .concat(getDataList(this.freeSockets))
    .forEach(function (socket) {
      socket.destroy();
    });

  this.requests    = {};
  this.sockets     = {};
  this.freeSockets = {};
}

function ForeverAgentSSL (options) {
  ForeverAgent.call(this, options);
}
util.inherits(ForeverAgentSSL, ForeverAgent);

ForeverAgentSSL.prototype.createConnection = createConnectionSSL;
ForeverAgentSSL.prototype.addRequestNoreuse = AgentSSL.prototype.addRequest;

function createConnectionSSL (port, host, options) {
  if (typeof port === 'object') {
    options = port;
  } else if (typeof host === 'object') {
    options = host;
  } else if (typeof options === 'object') {
    options = options;
  } else {
    options = {};
  }

  if (typeof port === 'number') {
    options.port = port;
  }

  if (typeof host === 'string') {
    options.host = host;
  }

  return tls.connect(options);
}
