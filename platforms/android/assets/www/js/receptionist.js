var ObjectID 			 = require('./objectID').ObjectID;
var localFarReference 	 = require('./farReference').localFarReference;
var localIsoFarReference = require('./farReference').localIsoFarReference;
var remoteFarReference   = require('./farReference').remoteFarReference;
var isolateFarReference  = require('./farReference').isolateFarReference;
var ReferenceProxy 		 = require('./proxy').ReferenceProxy;

function Receptionist(connectionManager) {
	//maps id to local object
	var objectsTable   = {};
	//dictionary of near references to local objects (identified by id)
	var localFarReferences = {};
	//dictionary of near references to published local objects (identified by objectID, grouped by typetag)
	var publishedFarReferences = {};
	//dictionary of far references to discovered remote objects
	var remoteFarReferences = {};
	//collection of resolvers for pending futures
	var resolvers = {};
	//collection of mutable operations (array of methodnames, identified by objectID)
	var mutableOperations = {};
	//collection of registrations for each distributed isolate
	var isolateRegistrations = {};
	
	
	// Creation of sharable objects
	this.createObject = function(object) {
		//Add a unique global id to the object which can be distributed to other actors
		var objectID = new ObjectID();
		//Create a local far reference to the object
		var aLocalFarReference = new localFarReference(objectID, this);
		//Store the object
		objectsTable[objectID.getId()] = object;
		//Store the local far reference pointing to the object
		localFarReferences[objectID.getId()] = aLocalFarReference;
		return aLocalFarReference.publicInterface;
	};

	// Creation of a reference proxy
	this.createReferenceProxy = function(behaviour) {
		return new ReferenceProxy(behaviour);
	};
	
	// Creation of sharable objects (by copy)
	this.createIsolate = function(object) {
		//Add a unique global id to the object which can be distributed to other actors
		var objectID = new ObjectID();
		//Create a local far reference to the isolate
		var isolateFarReference = new localIsoFarReference(objectID, this);
		//Store the object
		objectsTable[objectID.getId()] = object;
		//Store the  far reference pointing to the isolate
		localFarReferences[objectID.getId()] = isolateFarReference;
		return isolateFarReference.publicInterface;
	};
	
	// Publication of a sharable object
	this.publishObject = function(farReference, typetag) {
		var objectID = farReference.getObjectID();
		if (!publishedFarReferences[typetag])
			publishedFarReferences[typetag] = [];
		publishedFarReferences[typetag].push(objectID);
		var reference = this.getRemoteFarReference(objectID);
		if (reference)
			reference.setTypeTag(typetag);
	};
	
	// Return collection of published objects
	this.getPublishedObjects = function() {
		return publishedFarReferences;
	};
	
	// Return reference to specific object
	this.getObjectReference = function(objectID) {
		var id = objectID.getId();
		if (localFarReferences[id])
			return localFarReferences[id];
		
		console.log("[ERROR] Receptionist did not find an object with id <" + id + ">");			
	};
	
	// Return collection of remote references
	this.getRemoteFarReferences = function(host) {
		var returnList = [];
		for (var typetag in remoteFarReferences){
			var list = remoteFarReferences[typetag];
			list.forEach(function(reference) {
				if (reference.getObjectID().getHost() == host);
					returnList.push(reference);
			});
		};
		return returnList;		
	};
	
	this.getRemoteFarReferencesTypeTag = function(typetag) {
		var list = remoteFarReferences[typetag];
		if (list)
			return list;
		else
			return [];
	};
	
	this.getRemoteFarReference = function(objectID) {
		var result;
		var host = objectID.getHost();
		for (var typetag in remoteFarReferences) {
			var list = remoteFarReferences[typetag];
			list.forEach(function(reference){
				if (reference.getObjectID().getId() == objectID.getId()) {
					result = reference;
				}
			});
			if (result)
				break;
		}
		return result;
	};
	
	// Discover an object shared by another client
	this.addDiscoveredObject = function(objectID, typetag, proxy, strategy, mutableList) {
		//Create a reference to the remote object
		var aReference;
		if (strategy == "by_reference")
			aReference = new remoteFarReference(objectID, this);
		else {
			aReference = new isolateFarReference(objectID, this);
			aReference.setMutableList(mutableList);
		}
		//Store the reference
		if (remoteFarReferences[typetag])
			remoteFarReferences[typetag].push(aReference);
		else
			remoteFarReferences[typetag] = [aReference];
		//Install a proxy on the reference
		if (proxy)
			aReference.setProxy(proxy);
		//Set the typetag of the reference
		aReference.setTypeTag(typetag);
		//Return the public interface of the reference	
		return aReference.publicInterface;
	};
	
	// Get the internally stored, sharable object based on its objectID
	this.getObject = function(objectID) {
		if (!objectID.isRemote())
			//Resolved object is a local object
			return objectsTable[objectID.getId()];
	};
	
	// Send a message to a discovered object shared by another client
	this.sendMessage = function(msg, objectID, futureID) {
		connectionManager.sendMessage(msg, objectID, futureID);
	};
	
	// Send a response to a discovered object shared by another client
	this.sendResponse = function(sourceSocket, result, serializedObjectID, serializedFutureID) {
		connectionManager.sendResponse(sourceSocket, result, serializedObjectID, serializedFutureID);
	};
	
	// Send a request for the local copy of a received isolate
	this.requestIsolateCopy = function(objectID, futureID) {
		connectionManager.requestIsolateCopy(objectID, futureID);
	};
	
	// Check if the socket connection handling messages for the remote object
	// is already usable
	this.checkAvailability = function(objectID) {
		if(typeof(objectID) == 'undefined')
			return false;
		
		return connectionManager.checkAvailability(objectID.getHost());
	};
	
	// Store the resolver of a future being the result of a message send
	// to a remote object. Once an answer from the remote object is received,
	// the future will be resolved. 
	this.addResolver = function(futureID, resolver) {
		resolvers[futureID.serialize()] = resolver;
	};
	
	
	
	// Resolve a resolver stored when an answer is received after a method
	// invocation of a remote object
	this.resolve = function(serializedObjectID, serializedFutureID, value) {
		var resolver = resolvers[serializedFutureID];
		if (resolver) {
			//returned value was a serialized far reference; create new far reference
			//(value contains s_id, s_onReceive and s_onPassReference)
			//console.log("check");
			//console.log(value);
			if (value && (typeof value == "string") && (value.indexOf("referenceID")>-1)) {
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
				value = this.addDiscoveredObject(new ObjectID(JSON.stringify(passedReference.referenceID)), passedTypeTag, passedProxy, strategy, mutableList);
			}
			//call the onReceive of the remote far reference
			var ref = this.getRemoteFarReference(new ObjectID(serializedObjectID));
			//Check onReceive of ref!
			//console.log(JSON.stringify(ref.onReceive));
			ref.onReceive({"value":value, "resolver":resolver});
		} else
			console.log("[ERROR] Did not find resolver of future <" + serializedFutureID + ">");
	};
	
	// Identify one of the operations of an isolate as a mutable operation
	this.addMutableOperation = function(objectID, methodName){
		var object = this.getObject(objectID);
		if (object[methodName]) {
			if (mutableOperations[objectID])
				mutableOperations[objectID].push(methodName);
			else
				mutableOperations[objectID] = [methodName];
		} else
			console.log("[ERROR] Method " + methodName + " not found in the object");
	};
	
	// Get the list of all mutable operations of an isolate
	this.getMutableList = function(objectID) {
		if (mutableOperations[objectID.getId()])
			return mutableOperations[objectID.getId()];
		else
			return [];
	};


	// Modifiy the value of a property of an object
	this.modifyIsolate = function(objectID, name, value) {
		if(!objectID.isRemote()) {
			var registrations = this.getIsolateRegistrations(objectID);
			objectsTable[objectID.getId()][name] = value;

			console.log("modifying isolate for:");
			registrations.forEach(function(host){
				console.log(host);
				connectionManager.sendIsolateUpdate(host, objectID);
			});
		}
	};

	// Register a client for a specific isolate object (i.e. the client holds a copy of the isolate)
	this.registerForIsolate = function(objectID, hostName) {
		if(isolateRegistrations[objectID])
			isolateRegistrations[objectID.getId()].push(hostName);
		else
			isolateRegistrations[objectID.getId()] = [hostName];
	};

	// Get the list of hosts that are registered for a specific isolate
	this.getIsolateRegistrations = function(objectID) {
		var registrations = isolateRegistrations[objectID.getId()];
		if (registrations)
			return registrations;
		else
			return [];
	};
}

module.exports.Receptionist = Receptionist;