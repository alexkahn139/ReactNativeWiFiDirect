import {DeviceEventEmitter, NativeModules} from 'react-native';
import {EventEmitter} from 'events'


const WiFiDirect = NativeModules.WiFiDirectModule;

var devices = [];
var services= [];

var watchfulltype = "";
var watchflag = false;
var watchcallback = null;



export default class WiFiDirectModule extends EventEmitter {


    constructor (props) {
        super(props)

        this._dListeners = {};

        this.addDeviceListeners()
    }


    addDeviceListeners (){
        if (Object.keys(this._dListeners).length){
            return this.emit('error', new Error("WiFi-Direct listeners are already in place"))
        }

        this._dListeners.onWifiDirectPeers = DeviceEventEmitter.addListener('onWifiDirectPeers', params => {
            console.log("Direct Peers");
            devices.push(params);
            console.log(devices);
        });

        this._dListeners.onWifiDirectServices = DeviceEventEmitter.addListener('onWifiDirectServices', params => {
            console.log("Direct Service");
            services.push(params);
            console.log(services);
            if (watchflag) {
                if (watchfulltype === params.name){
                    watchcallback();
                }
                    }
        });
    }

    /**
     * Remove all event listeners and clean map
     */
    removeDeviceListeners () {
        Object.keys(this._dListeners).forEach(name => this._dListeners[name].remove())
        this._dListeners = {}
    }

    initWifiDirect(){
        // this._services= {}
        // this.emit('update')
        console.log("Clicked init");
        WiFiDirect.initWifiDirect()
    }
    registerService(serviceName){
        console.log("Clicked register");
        WiFiDirect.startRegistration(serviceName);
    }
    discoverPeers(){
        devices= [];
        // this.emit('update')
        console.log("Clicked Discover peers");
        WiFiDirect.discoverPeers();
    }
    discoverServices(){
        services = [];
        console.log("Clicked Discover services");
        WiFiDirect.discoverServices();
    }
    connectService(address){
        console.log("Connect to " + address);
        WiFiDirect.wifiDirectConnectToPeer(address);
    }

    getDevices(){
        return devices;
    }
    getServices(){
        return services;
    }


    watch(fulltype, succes) {
        watchflag = true;
        watchcallback = succes;
    }


}
