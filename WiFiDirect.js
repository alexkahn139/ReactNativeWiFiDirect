import {DeviceEventEmitter, NativeModules} from 'react-native';
import {EventEmitter} from 'events'


const WiFiDirect = NativeModules.WiFiDirectModule;

var devices = [];
var services= [];

export default class WiFiDirectModule extends EventEmitter {

    constructor (props) {
        super(props)

        this._devices = {};
        this._services = {};
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
    registerService(){
        console.log("Clicked register");
        WiFiDirect.startRegistration("AlexKahn");
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

    getDevices(){
        return this._devices;
    }


}
