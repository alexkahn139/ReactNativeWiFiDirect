import {DeviceEventEmitter, NativeModules} from 'react-native';
import {EventEmitter} from 'events'


const WiFiDirect = NativeModules.WiFiDirectModule;

export default class WiFiDirectModule  {

    // constructor (props) {
    //     super(props)
    //
    //     this._services = {}
    //     this._dListeners = {}
    //
    //     this.addDeviceListeners()
    // }
    //
    // addDeviceListeners (){
    //     if (Object.keys(this._dListeners).length){
    //         return this.emit('error', new Error("WiFi-Direct listeners are already in place"))
    //     }
    //
    // }
    //
    // /**
    //  * Remove all event listeners and clean map
    //  */
    // removeDeviceListeners () {
    //     Object.keys(this._dListeners).forEach(name => this._dListeners[name].remove())
    //     this._dListeners = {}
    // }

    initWifiDirect(){
        // this._services= {}
        // this.emit('update')
        console.log("Clicked init")
        WiFiDirect.initWifiDirect()
    }
    discoverPeers(){
        // this._services= {}
        // this.emit('update')
        console.log("Clicked Discover")
        WiFiDirect.discoverPeers()
    }


}
/////