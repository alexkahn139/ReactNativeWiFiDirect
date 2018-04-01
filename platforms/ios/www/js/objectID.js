var util = require('./util');

/*A unique id generator creates an id that is unique for all
 *clients on the the network. It combines the IP-address of the
 *client with a unique counter.*/

function ObjectID(serializedInfo) {
	var address;
	var uniqueID;
	if (serializedInfo) {
		serializedInfo = JSON.parse(serializedInfo);
		address = serializedInfo.address;
		uniqueID = serializedInfo.uniqueID;
	} else {
		address = util.address.val;
		uniqueID = address + ":" + ObjectID.idCtr;
		ObjectID.idCtr++;
	}
	
	this.getId = function() {
		return uniqueID;
	};
	
	this.getHost = function(){
		return address;
	};
	
	this.isRemote = function() {
		return (util.address.val != address);
	};
	
	this.serialize = function() {
		return JSON.stringify({"address" : address, "uniqueID" : uniqueID});
	};
};

ObjectID.idCtr = 0;

module.exports.ObjectID = ObjectID;