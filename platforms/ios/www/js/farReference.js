var Future   = require('./future').Future;
var ObjectID = require('./objectID').ObjectID;


function FarReference(objectID, receptionist) {
	var self = this;
	var proxyHeading;
	var typetag;
	
	/*******************************************************************
	 * Private in Object						     				   *
	 *******************************************************************/
	
	/*
	 * Serialization process of the proxy for the object. This serialized proxy
	 * behaviour is passed over the network when the object is distributed over
	 * the network.
	 */
	function serializeProxy() {
		var serializedFunctions = {};
		for(var key in self.proxy)
			serializedFunctions[key] = JSON.stringify(self.proxy[key], function(key, val) {
				return ((typeof val === "function") ? val+'' : val);
			});
		var serializedProxy = proxyHeading + "{";
		for (var key in serializedFunctions) {
			serializedProxy += "this." + key + " = ";
			if (serializedFunctions[key][0]=='"')
				serializedProxy += serializedFunctions[key].substring(1,serializedFunctions[key].length-1) + ";";
			else
				serializedProxy += serializedFunctions[key] + ";";
		}
		return serializedProxy + "}";
	};
	
	/*******************************************************************
	 * Public inside library					     				   *
	 *******************************************************************/
	//Return Object ID
	this.getObjectID = function() {
		return objectID;
	};
	
	//Set the proxy for the far reference
	this.setProxy = function(aProxy) {
		var serializedProxy = aProxy.serialize();
		proxyHeading = serializedProxy.substring(1,serializedProxy.indexOf('{'));
		aProxy.attachToReference(this.proxy);
	};
	
	//Call the onReceive behavior of the far reference
	this.onReceive = function(message) {
		this.proxy["onReceive"](message);
	};
	
	//Call the onPassReference behavior of the far reference
	this.onPassReference = function(reference) {
		this.proxy["onPassReference"](reference);
	};
	
	//Set the typetag with which the object is exported
	this.setTypeTag = function(tag) {
		typetag = tag;
	};
	
	//Get the typetag with which the object is exported
	this.getTypeTag = function(){
		return typetag;
	};

	//Serialize the far reference
	this.serialize = function() {
		var serializedProxy = proxyHeading ? serializeProxy() : null;
		var serializedReference = {
			referenceID : {"address" : objectID.getHost(), "uniqueID" : objectID.getId()},
			referenceProxy : serializedProxy,
			referenceType : "by_reference",
			referenceTypeTag : typetag
		};
		return JSON.stringify(serializedReference, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		}); 
	};
}


// A reference pointing to a local object
function localFarReference(objectID, receptionist) {
	var self = this;
	var proxyHeading;
	var typetag;
	
	//Inherit from FarReference
	FarReference.call(this, objectID, receptionist);
	/*******************************************************************
	 * Default behaviour for receiving messages and passing references *
	 * (can be overwritten by setProxy function)     				   *
	 *******************************************************************/
	this.proxy = {
		"onReceive" : function(message){
			if (!message || !message.type || !message.method || !message.arguments || !message.source)
				console.log("[ERROR] On invoke: missing properties of message");
			else {
				var serializedFutureID = message.futureID;
				var serializedObjectID = message.objectID;
				var future = self.asyncSend(message, message.type, message.timeout);
				//note: if the receiving client can not respond before timeout elapsed, the answer will not be sent anymore
				if ((message.type == "twoway") || (message.type == "due")) {
					future.whenBecomes(
						function(result) {
							receptionist.sendResponse(message.source, result, serializedObjectID, serializedFutureID);
						}, 
						function (exc) {
							console.log("[WARNING] Method invocation resulted in exception <" + exc + ">");
					});
					future.whenExpires(
						function(exc) {
							console.log("[WARNING] Asynchronous invocation on local object expired");
						}
					);
				};
			};
		} ,
		"onPassReference" : function(reference){}
	};

	this.asyncSend = function(msg, type, timeout) {
		var futureObject;
		var object = receptionist.getObject(objectID);
		var result;
		
		if ((type == "oneway") || (type == "twoway") || (type == "due")) {
			var property = object[msg.method];
			var result = (typeof property == "function") ?
						 object[msg.method].apply(object, msg.arguments) :
						 object[msg.method];
			if (type == "twoway") {
				futureObject = new Future();
				futureObject.resolver.resolve(result);
				return futureObject.future;
			} else if (type == "due") {
				futureObject = new Future(timeout);
				futureObject.resolver.resolve(result);
				return futureObject.future;
			}
		} else
			console.log("[ERROR] Type of message: " + type + " is not known");
	};
	
	/*******************************************************************
	 * Public interface of local far references outside library        *
	 *******************************************************************/
	this.publicInterface = {
		"setProxy"	   : function(proxy) {self.setProxy(proxy);},
		"asyncSend"    : function(msg, type, timeout) {return self.asyncSend(msg, type, timeout);},
		"getObjectID"  : function() {return self.getObjectID();},
		"constructor"  : "localFarReference"
	};
}


// A reference pointing to a local isolate
function localIsoFarReference(objectID, receptionist) {
	var self = this;
	var proxyHeading;
	var typetag;
	
	//Inherit from localFarReference
	localFarReference.call(this, objectID, receptionist);

	function serializeProxy() {
		var serializedFunctions = {};
		for(var key in self.proxy)
			serializedFunctions[key] = JSON.stringify(self.proxy[key], function(key, val) {
				return ((typeof val === "function") ? val+'' : val);
			});
		var serializedProxy = proxyHeading + "{";
		for (var key in serializedFunctions) {
			serializedProxy += "this." + key + " = ";
			if (serializedFunctions[key][0]=='"')
				serializedProxy += serializedFunctions[key].substring(1,serializedFunctions[key].length-1) + ";";
			else
				serializedProxy += serializedFunctions[key] + ";";
		}
		return serializedProxy + "}";
	};
	
	// Indicate which operations mutate the object and require connection to
	// the original isolate
	function setMutableOperation(methodName){
		receptionist.addMutableOperation(objectID, methodName);
	}

	// Change the value of a property of an isolate, which results in the updates
	// being pushed to the remote versions of the isolate
	function setProperty(propertyName, propertyValue){
		receptionist.modifyIsolate(objectID, propertyName, propertyValue);
	}


	function setProxy (aProxy) {
		var serializedProxy = aProxy.serialize();
		proxyHeading = serializedProxy.substring(1,serializedProxy.indexOf('{'));
		aProxy.attachToReference(self.proxy);
		console.log("attached proxy...");
		console.log(proxyHeading);
	};

	//Serialize the isolate far reference (serialization process now includes list with mutating operations)
	this.serialize = function() {
		var serializedProxy = proxyHeading ? serializeProxy() : null;
		console.log("serializedProxy");
		console.log(serializedProxy);
		var serializedReference = {
			referenceID : {"address" : objectID.getHost(), "uniqueID" : objectID.getId()},
			referenceProxy : serializedProxy,
			referenceType : "by_copy",
			referenceMutableList : receptionist.getMutableList(objectID),
			referenceTypeTag : this.getTypeTag()
		};
		return JSON.stringify(serializedReference, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		}); 
	};
	
	this.publicInterface.constructor  		 = "localIsoFarReference";
	this.publicInterface.setMutableOperation = setMutableOperation;
	this.publicInterface.setProperty 		 = setProperty;
	this.publicInterface.setProxy			 = setProxy;
}




// A reference pointing to a remote object
function remoteFarReference(objectID, receptionist) {
	//Inherit from FarReference
	FarReference.call(this, objectID, receptionist);
	
	var self = this;
	// An outbox stores all messages sent to the remote
	// object when the remote object is not accessible
	var outbox = [];
	/*******************************************************************
	 * Default behaviour for receiving messages and passing references *
	 * (can be overwritten by setProxy function)     				   *
	 *******************************************************************/
	this.proxy = {
		"onReceive" : function(message){
			message.resolver.resolve(message.value);
		} ,
		"onPassReference" : function(reference){}
	};
	
	function sendMessage(message, objectID, futureID) {
		console.log("objectID in sendMessage in farReference.js : " + objectID);
		if (receptionist.checkAvailability(objectID)) {
			receptionist.sendMessage(message, objectID, futureID);
		} else {
			outbox.push({"message": message, "objectID": objectID, "futureID" : futureID});	
		}
	};
	
	this.getOutbox = function() {
		return outbox;
	};
		
	
	this.asyncSend = function(msg, type, timeout) {
		var futureObject;
		var result;
		
		if (msg.messagetype == "asyncMessage") {
			msg.type = type;
			msg.timeout = timeout;
			
			if ((type == "oneway") || (type == "twoway") || (type == "due")) {
				if (type == "oneway") {
					console.log("In asyncSend, goint to send oneway message : " + objectID); // kdenk dat het futureObject.getObjectId() zou moeten zijn
					sendMessage(msg, objectID);	
				}	
				else {
					futureObject = (type == "due") ? new Future(timeout) : new Future();
					receptionist.addResolver(futureObject.getObjectId(), futureObject.resolver);
					sendMessage(msg, objectID, futureObject.getObjectId());
					return futureObject.future;
				}
			} else
				console.log("[ERROR] Could not send message: invalid type <" + type + ">");
		} else
			console.log("[ERROR] Could not send message: invalid message construct");
	};
		
	
	/*******************************************************************
	 * Public interface of remote far references outside library       *
	 *******************************************************************/
	this.publicInterface = {
		"setProxy"	   : function(proxy) {self.setProxy(proxy);},
		"asyncSend"    : function(msg, type, timeout) {return self.asyncSend(msg, type, timeout);},
		"getObjectID"  : function() {return self.getObjectID();},
		"constructor"  : "remoteFarReference"
	};
};


// A reference pointing to an isolate
function isolateFarReference(objectID, receptionist) {
	//Inherit from FarReference
	FarReference.call(this, objectID, receptionist);
	
	var self = this;
	var outbox = [];
	var localObject = {};
	var mutableList = [];
	
	this.proxy = {
		"onReceive" : function(message){
			console.log("in isolateFarReference, message is : " + message.objectID);
			if (message.value && message.resolver){
				message.resolver.resolve(message.value);
			} else if (localObject[message.method] && (mutableList.indexOf(message.method) < 0)) {
				var property = localObject[message.method];
				var returnVal = (typeof property == "function") ? 
								property.apply(localObject, message.arguments) : property;
				var serializedObjectID = message.objectID.serialize();
				var serializedFutureID = message.futureID ? message.futureID.serialize() : null;
				receptionist.resolve(serializedObjectID, serializedFutureID, returnVal);
			} else if (receptionist.checkAvailability(message.objectID)) {
				receptionist.sendMessage(message, message.objectID, message.futureID);
				localObject = {};
			} else {
				outbox.push({"message": message, "objectID": message.objectID, "futureID" : message.futureID});	
			}
		} ,
		"onPassReference" : function(reference){}
	};
	
	this.setMutableList = function(list) {
		mutableList = list;
	};
	
	this.getOutbox = function() {
		return outbox;
	};
	
	this.asyncSend = function(msg, type, timeout) {
		var futureObject;
		var result;
		
		if (msg.messagetype == "asyncMessage") {
			msg.type = type;
			msg.timeout = timeout;
			msg.objectID = objectID;
			console.log("in asyncSend of isolateFarReference (farreference.js), objectID is : " + msg.objectID);

			msg.arguments = msg.arguments.map(function(arg) {
				if ((typeof arg == "string") && (value.indexOf("referenceID")>-1)) {
					var passedReference = JSON.parse(value);
					var passedProxy = passedReference.referenceProxy;
					var passedTypeTag = passedReference.referenceTypeTag;
					if (passedProxy) {
						while (passedProxy.indexOf("\\t")>-1)
								passedProxy = passedProxy.replace("\\t", "\t");
						while (passedProxy.indexOf("\\n")>-1)
							passedProxy = passedProxy.replace("\\n", "\n");
						while (passedProxy.indexOf('\\"')>-1)
							passedProxy = passedProxy.replace('\\"', '\"');
						passedProxy = new Function("return " + passedProxy)();
						passedProxy = new ReferenceProxy(passedProxy);
					}
					var strategy    = passedReference.referenceType;
					var mutableList = passedReference.referenceMutableList;
					return receptionist.addDiscoveredObject(new ObjectID(JSON.stringify(passedReference.referenceID)), passedTypeTag, passedProxy, strategy, mutableList);
				} else
					return arg;
			});
			
			if ((type == "oneway") || (type == "twoway") || (type == "due")) {
				if (type == "oneway")
					this.proxy["onReceive"](msg);	
				else {
					futureObject = (type == "due") ? new Future(timeout) : new Future();
					msg.futureID = futureObject.getObjectId();
					receptionist.addResolver(futureObject.getObjectId(), futureObject.resolver);
					this.proxy["onReceive"](msg);
					//If a mutable operation has been called remotely, the local copy of the isolate
					//has to be destroyed (to avoid intermediate read-outs) and updated
					futureObject.future.whenBecomes(function(response) {
						if (Object.keys(localObject).length == 0)
							self.updateObject();
					});
					return futureObject.future;
				}
			} else
				console.log("[ERROR] Could not send message: invalid type <" + type + ">");
		} else
			console.log("[ERROR] Could not send message: invalid message construct");
	};

	this.updateObject = function() {
		var futureObject = new Future(6000);
		receptionist.addResolver(futureObject.getObjectId(), futureObject.resolver);
		
		console.log("in update object : " + objectID);
		if (receptionist.checkAvailability(objectID))
			receptionist.requestIsolateCopy(objectID, futureObject.getObjectId());
		else {
			var msg = {"messagetype":"isolateRequest", "objectID":objectID,"futureID":futureObject.getObjectId()};
			outbox.push({"message":msg, "objectID":msg.objectID, "futureID":msg.futureID});
		}
		
		futureObject.future.whenBecomes(function(isolateCopy){
			//reevaluate functions
			isolateCopy = new Function("return" + isolateCopy)();
			for (var key in isolateCopy) {
				var property = isolateCopy[key];
				if ((typeof property == "string") && (property.indexOf("function") == 0))
					isolateCopy[key] = new Function("return " + property)();
			}
			localObject = isolateCopy;
		});
		
		futureObject.future.whenExpires(function(exception){
			console.log("[ERROR] Failed to request copy of remote isolate");
		});
	};

	//Serialize the isolate far reference (serialization process now includes list with mutating operations)
	this.serialize = function() {
		var serializedProxy = null;
		var serializedReference = {
			referenceID : {"address" : objectID.getHost(), "uniqueID" : objectID.getId()},
			referenceProxy : this.serializedProxy,
			referenceType : "by_copy",
			referenceMutableList : receptionist.getMutableList(objectID),
			referenceTypeTag : this.getTypeTag()
		};
		return JSON.stringify(serializedReference, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		}); 
	};
	
	/*******************************************************************
	 * Public interface of remote far references outside library       *
	 *******************************************************************/
	this.publicInterface = {
		"asyncSend"    : function(msg, type, timeout) {return self.asyncSend(msg, type, timeout);},
		"getObjectID"  : function() {return self.getObjectID();},
		"constructor"  : "isolateFarReference"
	};
	
	this.updateObject();
}


module.exports.localFarReference    = localFarReference;
module.exports.localIsoFarReference = localIsoFarReference;
module.exports.remoteFarReference   = remoteFarReference;
module.exports.isolateFarReference  = isolateFarReference;