var webrtcUtil = require('./webrtcUtil');
var EventEmitter = require('wolfy87-eventemitter');

/*
 * Creates a TCP socket using WebRTC's DataChannel as underlying technology.
 */

function Socket(args) {
    this.state = "initialized"; // "initialized" || "listening" || "connected" || "closed" || "error"
    this.isValid = false;
    this.hostName = args.hostName;
    this.port = args.port.toString();

    this.channel = null;
    this.peerConnection = null;
    this.eventEmitter = new EventEmitter();

    this.connect = function() {
        if(this.state === "initialized")
            webrtcUtil.connectToPeer(this);
    };
        
    this.listen = function() {
        if(this.state === "initialized") {
            webrtcUtil.listeningSockets.push(this);
            this.state = "listening";
        }
    };
        
    this.write = function(str) {
        if(this.state === "connected") 
            this.channel.send(str);
    };

    this.close = function() {
        if(this.state !== "closed") {
            this.channel.close();
            this.peerConnection.close(); // Will trigger an event whose callback will put this socket in state "closed".
        }
    };

    this.addEventListener = function(name, callback) {
        this.eventEmitter.addListener(name, callback);
    };

    this.removeEventListener = function(name, callback) {
        // Multiple listeners can be registered for the same event. The callback parameter is used to determine which listener to remove.
        this.eventEmitter.removeListener(name, callback);
    };
}

module.exports.Socket = Socket; 
module.exports.initZeroConf = function(ip) { webrtcUtil.initZeroConf(ip); };