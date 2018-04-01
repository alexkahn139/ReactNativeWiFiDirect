function ReferenceProxy(behaviour) {
	// Give access to parent implementation of methods
	var resolvedBehaviour;
	var reference;
	
	function argumentCount(func) {
		return func.length;
	}
	
	function validate() {
		var valid = true;
		for (var method in resolvedBehaviour) {
			if ((typeof reference[method] == "function") && (typeof resolvedBehaviour[method] == "function")) {
				var argCtr1 = argumentCount(reference[method]);
				var argCtr2 = argumentCount(resolvedBehaviour[method]);
				if ((argCtr1>0) && (argCtr1 != argCtr2)) {
					console.log("[ERROR] Method " + method + " should take " + argCtr1 +
								" argument(s), instead it takes " + argCtr2 + " argument(s).");
					valid = false;
					break;
				}
			}
		}
		return valid;
	};
	
	function getFunction(func) {
		return resolvedBehaviour[func] ? resolvedBehaviour[func] : oldBehaviour[func];
	};
	
	
	this.serialize = function() {
		var x = JSON.stringify(behaviour, function(key, val) {
			return ((typeof val === "function") ? val+'' : val);
		});

		return x;
	};

	
	this.attachToReference = function(aReference){
		var clonedReference = {};
		reference = aReference;
		for (var key in aReference)
			clonedReference[key] = aReference[key];
		//console.log(behaviour.toString());
		resolvedBehaviour = new behaviour(clonedReference);
		if (validate()) {
			for (var key in resolvedBehaviour) {
				reference[key] = resolvedBehaviour[key];
			}
			if (!reference.onReceive) reference.onReceive = oldBehaviour.onReceive;
			if (!reference.onPassReference) reference.onPassReference = oldBehaviour.onPassReference;
		} else 
			console.log("[ERROR] Failed to install new behaviour");
	};	
};

module.exports.ReferenceProxy = ReferenceProxy;