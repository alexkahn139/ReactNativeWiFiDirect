/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component, Props } from 'react';
import {
    Platform,
    StyleSheet,
    Text,
    View,
    Button
} from 'react-native';
import WiFiDirect from './WiFiDirect.js'
const wifidirectmod = new WiFiDirect();
console.log(WiFiDirect);

const instructions = Platform.select({
    ios: 'Press Cmd+R to reload,\n' +
    'Cmd+D or shake for dev menu',
    android: 'Double tap R on your keyboard to reload,\n' +
    'Shake or press menu button for dev menu',
});

type Props = {};

export default class App extends Component<Props> {
    render() {
        return (
            <View style={styles.container}>
                <Text style={styles.welcome}>
                    Welcome to React Native!
                </Text>
                <Text style={styles.instructions}>
                    To get started, edit App.js
                </Text>
                <Text style={styles.instructions}>
                    {instructions}
                </Text>
                <Button onPress={wifidirectmod.initWifiDirect}
                        title="Start init"
                        color="#841584"
                />
                <Button onPress={wifidirectmod.discoverPeers}
                        title="Start Peer Discovery"
                        color="#841584"
                />
                <Button onPress={wifidirectmod.registerService}
                        title="Start registration"
                        color="#841584"
                />
                <Button onPress={wifidirectmod.discoverServices}
                        title="Start Service Discovery"
                        color="#841584"
                />
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5FCFF',
    },
    welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
    },
    instructions: {
        textAlign: 'center',
        color: '#333333',
        marginBottom: 5,
    },
});
