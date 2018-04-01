// Will need promise (plugin react-promise)

import Async from 'react-promise'
import  WifiDirectModule  from 'WiFiDirect.js';

var reactNativePlugin = new Promise (function(resolve, reject) {
    // add eventlistener

    var wifidirect = WifiDirectModule;

    // initialise wifi-Direct

    reactNativePlugin = {
        Platform: new Platform(resolve),
        Network: new Network(wifidirect)
    }

});

function Platform(resolve) {
  this.osname = (device.platform === "iOS") ? "iphone" : device.platform.toLowerCase();
  var that = this;

  that.address = null // Fix to reveal the IP via the wifidirect code
  // Problem ip is not fixed before the connection




}

function Network(wifidirect){

    this.READ_WRITE_MODE = "";
    wifidirect.registerService();


}
