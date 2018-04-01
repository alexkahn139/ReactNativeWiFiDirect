// AmbientJS Messenger app for Cordova :)

var AmbientJS = require('./AmbientJS');
AmbientJS.events.addListener('AmbientJS-Ready', function() {

	var myName;
	var buddyList = {};
	var reference;

	function addToLog(msg) {
		document.getElementById('receivedMessages').innerHTML += msg + "<br>";
	}

	function initializeMessenger(name) {
		myName = name;	
		AmbientJS.online();
		
		var remoteInterface = AmbientJS.createObject({
			"getName"   : function () {
				return myName;},
			"receiveMsg": function (msg) {
				addToLog(msg);}
		});

		AmbientJS.exportAs(remoteInterface, "MESSENGER");
		
		AmbientJS.wheneverDiscovered("MESSENGER", function(reference){
			var msg = AmbientJS.createMessage("getName", []);
			
			var future = reference.asyncSend(msg, "twoway");
			future.whenBecomes(function(reply) {
				buddyList[reply] = reference;
				addToLog(reply + " joined the conversation");
			});
			
		});
	}

		
	function broadcast(text){
		var msg = AmbientJS.createMessage('receiveMsg', [myName + ": " + text]);
		for(var buddy in buddyList) {
			buddyList[buddy].asyncSend(msg, "oneway");
		};
		addToLog(myName + ": " + text);
	}

	// Add behaviour for the GUI
	function init() {
		initializeMessenger(document.getElementById('name').value);
		document.getElementById('confirm').style.visibility = "hidden"; 
	}

	function broadcastIndirection() {
		broadcast(document.getElementById('msg').value);
	}

	document.getElementById('send').onclick    = broadcastIndirection;
	document.getElementById('confirm').onclick = init;

	// Show text fields and buttons now that AmbientJS is ready to be used
	document.getElementById('msg').style.visibility     = "visible";
	document.getElementById('send').style.visibility    = "visible";
});