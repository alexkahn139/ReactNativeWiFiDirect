var ObjectID = require('./objectID').ObjectID;

function Future(timeout) {
	var self = this;
	var objectId = new ObjectID();
	var state = "UNRESOLVED";
	var resolvedValue = null;
	var subscribers = [];
	
	
	function addResolutionListener(subscriber) {
		switch (state) {
			case "RESOLVED" : subscriber.notifyResolved(resolvedValue); break;
			case "RUINED"   : subscriber.notifyRuined(resolvedValue); break;
			default    		: subscribers.push(subscriber); break; 
		};
		return null;
	}
	
	this.getObjectId = function() {
		return objectId;
	};
	
	this.future = {
		whenBecomes : function(resolvedBlock, exceptionBlock) {
							addResolutionListener({
								notifyResolved : function (val) {resolvedBlock(val);},
								notifyRuined   : function (exc) {if (exceptionBlock) exceptionBlock(exc);}
							});
		},
		whenExpires : function(exceptionBlock) {
							addResolutionListener({
								notifyResolved : function (val) {},
								notifyRuined   : function (exc) {
									if (exc == "EXPIRED") 
									exceptionBlock(exc);
								},
							});
		}
	};
	this.resolver = {
		resolve : function(val) {
					if (state == "UNRESOLVED") {
						state = "RESOLVED";
						resolvedValue = val;
						subscribers.forEach(function(subscriber) {
							subscriber.notifyResolved(val);
						});
					} else
						console.log("[WARNING] Future was already " + state.toLowerCase());
				  },
		ruin	: function(exc) {
					if (state == "UNRESOLVED") {
						state = "RUINED";
						resolvedValue = exc;
						subscribers.forEach(function(subscriber) {
							subscriber.notifyRuined(exc);
						});
					} else
						console.log("[WARNING] Future was already " + state.toLowerCase());
				  }
	};
	
	//Start timer of lease
	if (typeof timeout == "number")
		setTimeout(function(){self.resolver.ruin("EXPIRED");}, timeout);		
}

module.exports.Future = Future;