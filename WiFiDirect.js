import {DeviceEventEmitter, NativeModules} from 'react-native';
import {EventEmitter} from 'events'


const WiFiDirect = NativeModules.WiFiDirectModule;

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
        this._dListeners.found = DeviceEventEmitter.addListener('discoverPeers', params => {
            console.log(params);
            this._devices.add(params);
            console.log(this._devices);
        });
        this._dListeners.onWifiDirectPeers = DeviceEventEmitter.addListener('onWifiDirectPeers', params => {
            console.log(params);
            this._devices.add(params);
            console.log(this._devices);
        });
        this._dListeners.found = DeviceEventEmitter.addListener('discoverServices', params => {
            console.log(params);
            this._devices.add(params);
            console.log(this._services);
        });
        this._dListeners.onWifiDirectPeers = DeviceEventEmitter.addListener('onWifiDirectServices', params => {
            console.log(params);
            this._devices.add(params);
            console.log(this._services);
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
        console.log("Clicked init")
        WiFiDirect.initWifiDirect()
    }
    discoverPeers(){
        this._devices= {}
        // this.emit('update')
        console.log("Clicked Discover services")
        WiFiDirect.discoverPeers()
    }
    discoverServices(){
        console.log("Clicked Discover services")
        WiFiDirect.
    }

    getDevices(){
        return this._devices;
    }


}
