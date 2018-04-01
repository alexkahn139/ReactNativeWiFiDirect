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
		Ambient.online();
		
		var remoteInterface = Ambient.createObject({
			"getName"   : function () {
				return myName;},
			"receiveMsg": function (msg) {
				addToLog(msg);}
		});

		Ambient.exportAs(remoteInterface, "MESSENGER");
		
		Ambient.wheneverDiscovered("MESSENGER", function(reference){
			var msg = Ambient.createMessage("getName", []);
			
			var future = reference.asyncSend(msg, "twoway");
			future.whenBecomes(function(reply) {
				buddyList[reply] = reference;
				addToLog(reply + " joined the conversation");
			});
			
		});
	}

		
	function broadcast(text){
		var msg = Ambient.createMessage('receiveMsg', [myName + ": " + text]);
		for(var buddy in buddyList) {
			buddyList[buddy].asyncSend(msg, "oneway");
		};
		addToLog(myName + ": " + text);
		
		if (reference) {
			var msg1 = Ambient.createMessage("getValid", []);
			var msg2 = Ambient.createMessage("redeem", []);
			var msg3 = Ambient.createMessage("getName", []);
			
			var future1 = reference.asyncSend(msg1, "twoway");
			var future2 = reference.asyncSend(msg2, "twoway");
			var future3 = reference.asyncSend(msg3, "twoway");
			
			future1.whenBecomes(function(name){
				console.log("received validation: " + name);
			});
			future2.whenBecomes(function(reply){
				
			});
			future3.whenBecomes(function(reply){
				var future3 = reference.asyncSend(msg3, "twoway");
				future3.whenBecomes(function(name){
					console.log("name: " +name);
				});
			});
		}
	}

	// Add behaviour for the GUI
	document.getElementById('send').onClick    = () => broadcast(document.getElementById('msg').value);
	document.getElementById('confirm').onClick = () => { initializeMessenger(document.getElementById('name').value);
														 document.getElementById('confirm').style.visibility = "hidden"; 
													   };

	// Show text fields and buttons now that AmbientJS is ready to be used
	document.getElementById('msg').style.visibility     = "visible";
	document.getElementById('name').style.visibility    = "visible";
	document.getElementById('send').style.visibility    = "visible";
	document.getElementById('confirm').style.visibility = "visible";
});