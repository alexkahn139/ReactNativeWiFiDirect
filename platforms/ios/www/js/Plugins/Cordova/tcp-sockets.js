/****************************************************************************
 * TCP Sockets for Cordova by Kevin De Porre                                *
 *                                                                          *
 * Provides listening and connecting sockets.                               *
 * To establish a connection a connecting socket must connect with a        *
 * listening socket.                                                        *
 *                                                                          *
 * Both types of sockets are stored in their own dictionnary.               *
 * Those DCTs map the hostname of the socket to the socket.                 *
 * For connecting sockets the hostname is the ip address of the other peer. *
 * For listening sockets the hostname is the ip address of the peer we are  *
 * waiting for to connect with us.                                          *
 *                                                                          *
 * The implementation is based on WebRTC DataChannels.                      *
 * WebRTC don't allow to specify ports, hence the port arguments that are   *
 * passed to the sockets aren't used.                                       *
 *                                                                          *
 * An idea would be to use the port as a virtual port, only to uniquely     *
 * identify sockets. We could think that the string "<ip>:<port>" is        *
 * unique for every socket. But it is not! As every actor could have > 1    *
 * listening socket and they all use the same port (40401) ...              *
 *                                                                          *
 * Note: services published for setting up a socket connection use a        *
 *       dedicated service name ('_AmbientJS._tcp.local.') in order         *
 *       not to interfere with services published by AmbientJS.             *
 ****************************************************************************/

// Declare variables shared between the below functions
var zeroconf;
var RTCPeerConnection;
var RTCIceCandidate;
var RTCSessionDescription;

// Constants
var _SERVICE_TYPE_ = '_AmbientJS._tcp.local.';
var _SERVICE_PORT_ = 80;

var ownID; // Cordova plugin will set this once known
var config = { iceServers: [{url: "stun:stun.1.google.com:19302"}] };

// Below arrays are associative (i.e. dictionaries), mapping peer ID to the corresponding socket
var connectingSockets = []; 
var ownSockets = []; // stores listening sockets that are connected (i.e. valid)

// Below array contains all listening sockets that are not yet used (upon getting valid they are removed from this array and stored in "ownSockets" DCT).
var listeningSockets = [];


/*
 * The first 2 arrays below store the candidates we received, in order to be 
 * able to add them in the final step of the handshake for WebRTC DataChannel.
 * 
 * The remembered candidates array is used to catch candidates that are received to late.
 * Sometimes it can be that all steps of the WebRTC handshake have been done and we 
 * only need to add the candidates yet. But that the candidate(s) have not yet been received..
 * In that case we will remember in this array that we are still waiting for the candidates of a given socket.
 * Upon arrival of a candidate, we check if it is in the array and if it is we may immediately add it to the socket.
 */

var listening_candidate_array = [];
var connecting_candidate_array = [];
var rememberedCandidates = [];

// **************************************************************************

/*
 * Initializes the ZeroConf and (ios)RTC plugins.
 */

function initVariables() {
    zeroconf = cordova.plugins.zeroconf;

    // iosrtc plugin is only used on iOS
    if (window.device.platform === 'iOS') {
        // The iosrtc functions are in their own namespace, the below call will make them globally avalaible (e.g. window.RTCPeerConnection)
        cordova.plugins.iosrtc.registerGlobals();
    }

    // Overcome temporary browser differences
    RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
    RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.msRTCIceCandidate;
    RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

    if(typeof zeroconf === 'undefined')
        console.log("[ERROR]: ZeroConf plugin not ready!");
}

/*
 * Assigns all event handlers for a given WebRTC peer connection and channel.
 */

function setEventHandlers(peerConnection, channel, peerID, whichSocket) {
    channel.onmessage = function (event) {
        var str = event.data; // Received message
        var socket = (whichSocket === 'listening') ? ownSockets[peerID] : connectingSockets[peerID]; // Only peerID is not enough, we need to know in which array to search.

        // Received message must contain fields : "source" and "data", "data" must contain field "text"
        var txt = { text: str };
        var message = { source: socket, data: txt };

        // Fire 'read' event
        socket.eventEmitter.emit('read', message);
    };
    
    channel.onclose = function (event) {
        console.log(whichSocket + ' socket to/for ' + peerID + ' closed.');

        var socketArray = (whichSocket === 'listening') ? ownSockets : connectingSockets;
        var socket = socketArray[peerID];
        socket.state = "closed";

        // Delete socket from his array such that later he can reconnect
        delete socketArray[peerID];
    };
    
    channel.onerror = function (event) {
        var socket = (whichSocket === 'listening') ? ownSockets[peerID] : connectingSockets[peerID];
        socket.state = "error";

        console.log("[ERROR]: " + whichSocket + " socket to/for " + peerID + " encountered error.");
        console.error(event);
    };

    peerConnection.ondatachannel = function (ev) {
        ev.channel.onopen = function() {
            console.log("[INFO]: " + whichSocket + ' channel to ' + peerID + ' is open and ready to be used.');
            
            // Update the socket with the right peer connection and data channel.
            var socket = (whichSocket === 'listening') ? ownSockets[peerID] : connectingSockets[peerID];
            socket.peerConnection = peerConnection;
            socket.channel = ev.channel;

            socket.state = "connected";    
            socket.isValid = true;
        };
    };

    // On getting locally generated ICE
    peerConnection.onicecandidate = function (event) {
        if (!event || !event.candidate) return;
        var ICEcandidate = event.candidate;

        // Publish the candidate on the network
        var name = "_" + ownID + "_Candidate_"; // Name according to protocol : "_<ID>_Candidate_"
        var stringifiedCandidate = JSON.stringify(ICEcandidate);

        // If the candidate is on our listening socket it need to be added to the peer his connecting socket and vice versa !!!
        var reverse = (whichSocket === 'listening') ? 'connecting' : 'listening';

        zeroconf.register(_SERVICE_TYPE_, name, _SERVICE_PORT_, {
            'from': ownID,
            'to': peerID,
            'identification': reverse, // Identifies if the candidate must be added to the listening or connecting socket
            'type': 'Candidate',
            'data': stringifiedCandidate,
        });

    };
}

/***************
 * WebRTC Part *
 ***************/

/*
 * Setting up a WebRTC DataChannel requires following handshake :
 *    - Send an offer SDP to the peer and set it as your local description
 *    - Receive an offer answer SDP from the peer and set it as your remote description
 *    - On getting a locally generated ICE candidate, send it to the peer
 *    - On receiving an ICE candidate from the peer, add it to the connection (ONLY AFTER local and remote SDPs have been set !!!)
 */

function connectToPeer(socket) {
    // Remember socket as being a connecting socket to peerID
    var peerID = socket.hostName;
    connectingSockets[peerID] = socket;
    
    //console.log("[INFO]: Going to connect to " + peerID);

    // Make an RTCPeerConnection and DataChannel, than store it in the socket
    var peerConnection = new RTCPeerConnection(config);
    var channel = peerConnection.createDataChannel("RTCDataChannel"); // reliable channel by default

    socket.channel = channel;
    socket.peerConnection = peerConnection;

    /* 
     * Set all event handlers for the peer connection and channel.
     * 'connecting' argument identifies that it need to set the
     * event handlers for the connecting socket to peerID.
     */

    setEventHandlers(peerConnection, channel, peerID, 'connecting');

    peerConnection.createOffer(function (sessionDescription) {
        peerConnection.setLocalDescription(sessionDescription);

        // Publish our offer on the network
        var name = "_" + ownID + "_Offer_"; // Name according to protocol : "_<ID>_Offer_"
        var stringifiedSDP = JSON.stringify(sessionDescription);

        // The stringified offer is too long to put in one field and publish the service --> Need to be cut into 2 parts for some unknown reason...
        var p1 = stringifiedSDP.substring(0, (stringifiedSDP.length / 2));
        var p2 = stringifiedSDP.substring((stringifiedSDP.length / 2));

        // Use a dedicated service name ('_AmbientJS._tcp.local.') for the exhange of connection information in order not to interfere with AmbientJS services
        zeroconf.register(_SERVICE_TYPE_, name, _SERVICE_PORT_, {
            'from' : ownID,
            'to'   : peerID,
            'type' : 'Offer',
            'data1': p1,
            'data2': p2,
        });
    });
};


/*
 * Wrap zeroconf.watch call in a function because "ownID" need to be known at the time of calling.
 * Hence, the cordova plugin will call this function with its own id (ip address).
 * At this time we can also be sure that the device is ready. Thus we can initialize the variables (zeroconf plugin, etc.)
 */

function initZeroConf(ownHostName) {
    initVariables();
    ownID = ownHostName;

    // Register for services with type '_AmbientJS._tcp.local.' on the network
    zeroconf.watch(_SERVICE_TYPE_, function(result) {
        var action = result.action;
        var name = result.service.name;
        var service = result.service.txtRecord;

        //console.log("[DEBUG]: Found service " + name + " with type " + service.type + " from " + service.from + " to " + service.to);

        // Make sure the offer is intended for us 
        if(action == 'added' && service.type === 'Offer' && service.to === ownID) {

            /*
             * Receiving an offer means we need a listening socket.
             * On receiving an offer from a peer, "process" it and then create answer SDP and send it back to offerer.
             * The service was intended for us, hence we unregister it from the network, in order not to be processed more than once.
             */

            zeroconf.unregister(_SERVICE_TYPE_, name);
            //console.log("[DEBUG]: Received offer from " + service.from);

            // Fetch listening socket for the corresponding peer
            var socket;
            if(listeningSockets.length === 0) {
                console.log("[ERROR]: No listening sockets.");
                return;
            }
            else {
                for(var i=0; i<listeningSockets.length; i++) {
                    if(listeningSockets[i].listeningSocketForHost === service.from) {
                        // We found the listening socket that was waiting for this given peer to connect with us
                        socket = listeningSockets[i];
                        listeningSockets.splice(i, 1); // Remove socket from array
                        break;
                    }
                }
            }

            if(typeof(socket) === 'undefined' || socket.state !== "listening") {
                console.log("[ERROR]: Expected socket to be listening.");
                return;
            }

            // Remember the socket in the DCT of valid listening sockets
            ownSockets[service.from] = socket;

            // Receiving an offer means we do not yet have a peerconnection to that peer
            var peerConnection = new RTCPeerConnection(config);
            var channel = peerConnection.createDataChannel("RTCDataChannel");

            socket.channel = channel;
            socket.peerConnection = peerConnection;

            // Set all eventhandlers for the peer connection and data channel
            setEventHandlers(peerConnection, channel, service.from, 'listening');

            // Set our remote description to the one we received
            var offer = JSON.parse(service.data1 + service.data2); // data1, data2 both contain parts of the offer SDP
            peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create an answer
            peerConnection.createAnswer(function (sessionDescription) {
                peerConnection.setLocalDescription(sessionDescription);
                
                // Publish our (offer) answer SDP on the network
                var name = "_" + ownID + "_OfferAnswer_"; // Name according to protocol : "_<ID>_OfferAnswer_"
                var stringifiedSDP = JSON.stringify(sessionDescription);

                // The stringified offer answer is too long to put in one field and publish the service --> Need to be cut into 2 parts for some unknown reason...
                var p1 = stringifiedSDP.substring(0, (stringifiedSDP.length / 2));
                var p2 = stringifiedSDP.substring((stringifiedSDP.length / 2));

                zeroconf.register(_SERVICE_TYPE_, name, _SERVICE_PORT_, {
                    'from' : ownID,
                    'to'   : service.from,
                    'type' : 'OfferAnswer',
                    'data1': p1,
                    'data2': p2
                });

                // Now that we set the local and remote descriptions we must set all received candidates that are intended for THIS listening socket
                addCandidatesToConnection(service.from, 'listening');
            });
        }
        else if(action == 'added' && service.type === 'OfferAnswer' && service.to === ownID) {
            
            /* 
             * Receiving an offer answer means we sent an offer, hence, we have a connecting socket.
             * On receiving an answer set the remote description on the received answer.
             */

            //console.log("[DEBUG]: Received offer answer from " + service.from);

            // Fetch peerConnection
            var socket = connectingSockets[service.from];
            if(typeof(socket) === 'undefined') {
                console.log("[ERROR]: Expected to have a connecting socket.");
                return;
            }

            var peerConnection = socket.peerConnection;
            var answerSDP = JSON.parse(service.data1 + service.data2); // data1 and data2 both contain parts of the answer SDP

            // Set remote description
            peerConnection.setRemoteDescription(new RTCSessionDescription(answerSDP));

            // Now that we set the local and remote descriptions we must set all received candidates that are intended for THIS connecting socket
            addCandidatesToConnection(service.from, 'connecting');

            // Unregister service from the network, in order not to be processed more than once 
            zeroconf.unregister(_SERVICE_TYPE_, name);
        }
        else if(action == 'added' && service.type === 'Candidate' && service.to === ownID) {
            // On getting ICE candidate sent by other peer

            /* 
                We may NOT immediately add the candidate to the peer connection !!! 
                It must be done after the local and remote SDPs (descriptions) have been added
                --> Not respecting this order won't open the RTC DataChannel (onopen event)

                Hence, we put a callback in the listening/connecting candidate array which we will call after having set both descriptions.
            */

            var addCandidate = function(ICEcandidate, peerID, identification) {
                // Retrieve the peerConnection corresponding to the peer that send us the candidate
                var socket = (identification === 'listening') ? ownSockets[peerID] : connectingSockets[peerID];
                if(socket) {
                    var peerConnection = socket.peerConnection;

                    // Add the candidate to the connection
                    peerConnection.addIceCandidate(new RTCIceCandidate({
                        sdpMLineIndex: ICEcandidate.sdpMLineIndex,
                        candidate: ICEcandidate.candidate
                    }));
                }
            };

            // Check if that user already sent us some candidates
            var identification = service.identification;
            var candidate_array = (service.identification === 'listening') ? listening_candidate_array : connecting_candidate_array;

            var candidates = candidate_array[service.from];
            var thisCandidate = { candidate: JSON.parse(service.data), fn: addCandidate }; // Put argument and callback in an object

            if(candidates) {
                // Add this candidate to the array containing all candidates for the given socket
                candidates.push(thisCandidate);
            }
            else {
                // Make an array that stores the candidate and set it in the listening/connecting candidate array
                candidates = [ thisCandidate ];
                candidate_array[service.from] = candidates;
            }


            /*
             * Sometimes a candidate may be received after we set the local and remote SDPs.
             * The below piece of code will check if that was the case and if it is,
             * immediately add the candidate to the connection.
             */

            var waiting = false; // Indicates if we were waiting for this candidate to arrive
            for(var i=0; i<rememberedCandidates.length; i++) {
                if((service.from === rememberedCandidates[i].peerID) && (service.identification === rememberedCandidates[i].identification)) {
                    // Remembered in "rememberedCandidates" array, hence we were waiting for this candidate
                    waiting = true;
                    rememberedCandidates.splice(i, 1); // Remove from array
                    break;
                }
            }

            if(waiting)
                addCandidatesToConnection(service.from, service.identification);

            // Clean up
            zeroconf.unregister(_SERVICE_TYPE_, name);
        }
    });
};


/*
 * Removes the candidates that were stored in listening/connecting candidate array and adds them to the connection.
 */ 

function addCandidatesToConnection(peerID, identification) {
    var candidate_array = (identification === 'listening') ? listening_candidate_array : connecting_candidate_array;
    var candidates = candidate_array[peerID];

    if(typeof(candidates) !== 'undefined') {
        // Call all candidate callbacks (for the given socket) we remembered before
        for(var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i].candidate;
            var fun = candidates[i].fn;
            fun(candidate, peerID, identification);
        }

        // Remove added candidates from "candidate_array"
        delete candidate_array[peerID];
    }
    else {
        // Remember that on receiving a candidate from peerID, it still has to be added to the listening/connecting socket.
        rememberedCandidates.push({ 'peerID': peerID, 'identification': identification });
    }
}

module.exports.listeningSockets   = listeningSockets;
module.exports.connectToPeer      = connectToPeer;
module.exports.initZeroConf       = initZeroConf;