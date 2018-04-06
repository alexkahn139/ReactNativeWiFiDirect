package com.wifidirectpackage;


import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.NetworkInfo;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pDeviceList;
import android.net.wifi.p2p.WifiP2pInfo;
import android.net.wifi.p2p.WifiP2pManager;
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo;
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest;
import android.os.AsyncTask;
import android.os.Looper;
import android.provider.Settings;
import android.support.annotation.Nullable;
import android.util.Log;
import android.widget.Toast;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

import static android.content.ContentValues.TAG;

/**
 * Created by alexandre on 25/02/2018.
 * Copied and adapted from https://github.com/winaacc/sport_native/
 */

public class WiFiDirectModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    public WiFiDirectModule(ReactApplicationContext reactContext){
        super(reactContext);
        context = reactContext;
        reactContext.addLifecycleEventListener(this);
        wifiP2pManager = (WifiP2pManager) reactContext.getSystemService(Context.WIFI_P2P_SERVICE);
    }

    protected void sendEvent(String eventName, @Nullable WritableMap params){
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(eventName,params);
    }

    protected ReactApplicationContext context;
    private WifiP2pInfo mWifiP2pInfo;
    private WifiP2pManager wifiP2pManager;
    private WifiP2pManager.Channel wifiDirectChannel;
    private WifiP2pDnsSdServiceRequest serviceRequest;
    private int port =  8888;

    // Toast for debugging
//    int duration = Toast.LENGTH_SHORT;





    private WifiP2pManager.ConnectionInfoListener mInfoListener = new WifiP2pManager.ConnectionInfoListener(){
        @Override
        public void onConnectionInfoAvailable(final WifiP2pInfo minfo) {
            if(minfo.isGroupOwner){

                mWifiP2pInfo = minfo;
                WritableMap params = Arguments.createMap();
                params.putString("type","server");
                sendEvent("onWifiDirectConnected",params);
                AsyncTask<Void, Void, String> mDataServerTask = new AsyncTask<Void, Void, String>() {
                    @Override
                    protected String doInBackground(Void... params) {
                        try {
                            ServerSocket serverSocket = new ServerSocket(port);
                            Socket client = serverSocket.accept();
                            InputStream inputStream = client.getInputStream();
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            int i;
                            while ((i = inputStream.read()) != -1){
                                baos.write(i);
                            }
                            String str = baos.toString();
                            serverSocket.close();
                            return str;
                        }catch (IOException e){
                            return null;
                        }
                    }
                    @Override
                    protected void onPostExecute(String result){
                        Toast.makeText(context,"result:"+result, Toast.LENGTH_SHORT).show();
                        wifiP2pManager.removeGroup(wifiDirectChannel, new WifiP2pManager.ActionListener() {
                            @Override
                            public void onSuccess() {
                            }

                            @Override
                            public void onFailure(int reason) {

                            }
                        });
                    }
                };
                mDataServerTask.execute();
            }else if(minfo.groupFormed){
                mWifiP2pInfo = minfo;
                WritableMap params = Arguments.createMap();
                params.putString("type","client");
                sendEvent("onWifiDirectConnected",params);
            }
        }
    };

    private BroadcastReceiver broadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION.equals(action)){
                wifiP2pManager.requestPeers(wifiDirectChannel,mPeerListListener);
            }else if(WifiP2pManager.WIFI_P2P_DISCOVERY_CHANGED_ACTION.equals(action)){

            }else if(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(action)){
                NetworkInfo networkInfo = (NetworkInfo)intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO);
                if(networkInfo.isConnected()){
                    Log.i("WiFi-Direct", "Connected with succes");
                    wifiP2pManager.requestConnectionInfo(wifiDirectChannel,mInfoListener);
                }else{
                    Log.i("WiFi-Direct", "Failed connection");
                }
            }
        }
    };

    @Override
    public String getName(){
        return "WiFiDirectModule";
    }

    @Override
    public void onHostResume(){
        wifiDirectChannel = wifiP2pManager.initialize(context, Looper.myLooper(),null);
        IntentFilter mFilter = new IntentFilter();
        mFilter.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION);
        mFilter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
        mFilter.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
        mFilter.addAction(WifiP2pManager.WIFI_P2P_DISCOVERY_CHANGED_ACTION);
        mFilter.addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION);
        context.registerReceiver(broadcastReceiver, mFilter);
    }

    @Override
    public void onHostPause(){
        context.unregisterReceiver(broadcastReceiver);
        wifiP2pManager.removeGroup(wifiDirectChannel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() {
            }

            @Override
            public void onFailure(int reason) {

            }
        });
    }

    @Override
    public void onHostDestroy(){

    }

    @ReactMethod
    public void initWifiDirect(){ // Opens the WiFi settings
        Activity currentActivity = getCurrentActivity();

        Intent intent = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
        currentActivity.startActivity(intent);
    }

    @ReactMethod
    public void startRegistration(String buddyName) {
        //  Create a string map containing information about your service.
        Map record = new HashMap();
        record.put("listenport", String.valueOf(port));
        record.put("buddyname", buddyName + (int) (Math.random() * 1000));
        record.put("available", "visible");

        // Service information.  Pass it an instance name, service type
        // _protocol._transportlayer , and the map containing
        // information other devices will want once they connect to this one.
        WifiP2pDnsSdServiceInfo serviceInfo =
                WifiP2pDnsSdServiceInfo.newInstance("_Tourism recommender", "_presence._tcp", record);

        // Add the local service, sending the service info, network channel,
        // and listener that will be used to indicate success or failure of
        // the request.
        wifiP2pManager.addLocalService(wifiDirectChannel , serviceInfo, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() {
                // Command successful! Code isn't necessarily needed here,
                // Unless you want to update the UI or add logging statements.
            }

            @Override
            public void onFailure(int arg0) {
                // Command failed.  Check for P2P_UNSUPPORTED, ERROR, or BUSY
            }
        });
    }



    @ReactMethod
    public void discoverPeers(){ // This starts the discovery, real discovery happens in PeerListListener
        wifiP2pManager.discoverPeers(wifiDirectChannel,new WifiP2pManager.ActionListener(){
            @Override
            public void onSuccess() {
            }

            @Override
            public void onFailure(int reason) {
            }
        });
    }

    private WifiP2pManager.PeerListListener mPeerListListener = new WifiP2pManager.PeerListListener(){
        @Override
        public void onPeersAvailable(WifiP2pDeviceList peersList) {
            Collection<WifiP2pDevice> aList = peersList.getDeviceList();
            Object[] arr = aList.toArray();
            for (int i = 0; i < arr.length; i++) {
                WifiP2pDevice a = (WifiP2pDevice) arr[i];
                WritableMap params = Arguments.createMap();
                params.putString("Address",a.deviceAddress);
                params.putString("Device Name",a.deviceName);
                sendEvent("onWifiDirectPeers",params);
//                CharSequence text = "found peer";
//                Toast.makeText(context, text, duration).show();
            }
        }
    };

    final HashMap<String, String> buddies = new HashMap<String, String>();


    @ReactMethod
    private void discoverServices() {

        WifiP2pManager.DnsSdTxtRecordListener txtListener = new WifiP2pManager.DnsSdTxtRecordListener() {
            @Override
        /* Callback includes:
         * fullDomain: full domain name: e.g "printer._ipp._tcp.local."
         * record: TXT record dta as a map of key/value pairs.
         * device: The device running the advertised service.
         */

            public void onDnsSdTxtRecordAvailable(
                    String fullDomain, Map record, WifiP2pDevice device) {
                Log.d(TAG, "DnsSdTxtRecord available -" + record.toString());
                buddies.put(device.deviceAddress, (String) record.get("buddyname"));
            }
        };

        WifiP2pManager.DnsSdServiceResponseListener servListener = new WifiP2pManager.DnsSdServiceResponseListener() {
            @Override
            public void onDnsSdServiceAvailable(String instanceName, String registrationType,
                                                WifiP2pDevice resourceType) {

                // Update the device name with the human-friendly version from
                // the DnsTxtRecord, assuming one arrived.
                resourceType.deviceName = buddies
                        .containsKey(resourceType.deviceAddress) ? buddies
                        .get(resourceType.deviceAddress) : resourceType.deviceName;
                resourceType.


                WritableMap serviceParams = Arguments.createMap();
                serviceParams.putString("MacAddress", resourceType.deviceAddress);
                serviceParams.putString("Name", resourceType.deviceName);
                sendEvent("onWifiDirectServices", serviceParams);
                CharSequence text = "found service";
//                Toast.makeText(context, text, duration).show();

                Log.d(TAG, "onBonjourServiceAvailable " + resourceType + instanceName);
            }
        };

        wifiP2pManager.setDnsSdResponseListeners(wifiDirectChannel, servListener, txtListener);

        serviceRequest = WifiP2pDnsSdServiceRequest.newInstance();
        wifiP2pManager.addServiceRequest(wifiDirectChannel, serviceRequest,
                new WifiP2pManager.ActionListener() {

                    @Override
                    public void onSuccess() {
                        Log.v(TAG,"Added service discovery request");
                    }

                    @Override
                    public void onFailure(int arg0) {
                        Log.v(TAG,"Failed adding service discovery request");
                    }
                });
        wifiP2pManager.discoverServices(wifiDirectChannel, new WifiP2pManager.ActionListener() {

            @Override
            public void onSuccess() {
                Log.v(TAG,"Service discovery initiated");
            }

            @Override
            public void onFailure(int arg0) {
                Log.v(TAG,"Service discovery failed");

            }
        });
    }

    @ReactMethod
    public void wifiDirectConnectToPeer(String address){
        WifiP2pConfig config = new WifiP2pConfig();
        config.deviceAddress = address;
        wifiP2pManager.connect(wifiDirectChannel,config,new WifiP2pManager.ActionListener() {

            @Override
            public void onSuccess() {

            }

            @Override
            public void onFailure(int reason) {


            }
        });
    }

    private void onConnectionInfoAvailable(final WifiP2pInfo info) {

        // InetAddress from WifiP2pInfo struct.
        String groupOwnerAddress = info.groupOwnerAddress.getHostAddress();

        // After the group negotiation, we can determine the group owner
        // (server).
        if (info.groupFormed) {
            // Do whatever tasks are specific to the group owner.
            // One common case is creating a group owner thread and accepting
            // incoming connections.

            // Idea: Send the information that it is the GO to JavaScript
            // Let the client connect to the GO

            WritableMap groupOwnerParams = Arguments.createMap();
            groupOwnerParams.putBoolean("groupOwner", info.isGroupOwner);
            groupOwnerParams.putString("groupOwnerAddress", groupOwnerAddress);
            sendEvent("onIfGroupOwner", groupOwnerParams);

        }
    }

    @ReactMethod
    public void getGroupOwnerInfo(){
        onConnectionInfoAvailable(mWifiP2pInfo);
    }

    @ReactMethod
    public void wifiDirectSendData(String data){
        Socket socket = new Socket();
        String host = mWifiP2pInfo.groupOwnerAddress.getHostAddress();
        int port = 8888;
        try{
            socket.connect(new InetSocketAddress(host,port),5000);
            OutputStream stream = socket.getOutputStream();

            stream.write(data.getBytes());
        }catch (IOException e){

        }finally {
            if(socket != null){
                if (socket.isConnected()) {
                    try {
                        socket.close();
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }
    }
}