// Will need promise (plugin react-promise)

import Async from 'react-promise'
import  WifiDirectModule  from 'WiFiDirect.js';

var DeviceInfo = require('react-native-device-info');
var wifidirect = new WifiDirectModule;
var EventEmitter = require('wolfy87-eventemitter');




var reactNativePlugin = new Promise (function(resolve, reject) {

    // add eventlistener


    // initialise wifi-Direct

    reactNativePlugin = {
        Platform: new Platform(resolve),
        Network: new Network(wifidirect)
    }

});

function Platform(resolve) {
    this.osname = (device.platform === "iOS") ? "iphone" : device.platform.toLowerCase();
    var that = this;

    that.address = DeviceInfo.getMACAddress();
    //that.address = DeviceInfo.getIPAddress(); // Could be used if we decide to use the IP
    // Fix to reveal the IP via the wifidirect code
    // Problem ip is not fixed before the connection
    // We are going to use the MAC-address for the connection, same package can also return the IP
    -resolve(reactNativePlugin);
}

function Network(resolve){
    this.createBonjourService = function (args) {
        var serviceObject = {
            name: args.name,
            type: args.type,
            domain: args.domain,

            fulltype: args.type + '.' + args.domain,

            publish: function(args) {
                wifidirect.registerService(args);
            }
        }
        return serviceObject;
    };

    this.createBonjourBrowser = function (args) {
        var browserObj = {
            type:     args.serviceType,
            domain:   args.domain,
            fulltype: args.serviceType + '.' + args.domain,
            eventEmitter: new EventEmitter(), // Browser needs its own event handler in order not to interfere with other service browsers.

        search: function () {
                var evntEmitter = this.eventEmitter;
                wifidirect.watch(this.fulltype, function (result) {
                    var action  = result.action;
                    var service = result.service;
                    var name    = service.name;
                    var address = service.name;

                    // Because the IP will be renegotiated after
                    if (address!== reactNativePlugin.Platform.address){
                        // Only connect with other devices not with itself
                        wifidirect.connect(address);
                        // First we need to connect
                        // Then check who is the GO
                        // Than the GO can open a socket with the client
                    }

                })

        }

        }

    }


}
