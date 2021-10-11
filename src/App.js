import React, { useState, useEffect } from 'react';
import { SECP256K1Client } from 'jsontokens';
import { makeDIDFromAddress, UserSession, AppConfig } from '@stacks/auth'
import { Storage } from '@stacks/storage';
import {
  generateSecretKey, generateWallet, restoreWalletAccounts, decrypt, getAppPrivateKey,
  getStxAddress, createWalletGaiaConfig, getOrCreateWalletConfig,
  updateWalletConfigWithApp,
} from '@stacks/wallet-sdk/dist';
import {
  DEFAULT_PROFILE, fetchAccountProfile,
} from '@stacks/wallet-sdk/dist/models/profile';
import { TransactionVersion } from '@stacks/transactions';
import { makeGaiaAssociationToken } from '@stacks/wallet-sdk/dist/utils';
import { getPublicKeyFromPrivate, publicKeyToAddress } from '@stacks/encryption';
import { fetchPrivate } from '@stacks/common';

import './App.css';

const DEFAULT_PASSWORD = 'password';
const DEFAULT_GAIA_HUB_URL = 'https://hub.blockstack.org';
const DEFAULT_GAIA_HUB_READ_URL = 'https://gaia.blockstack.org/hub/';

//const VERSION = '1.3.1';

//const APP_NAME = 'Stacks demo';
//const APP_URL = 'https://192.168.1.43:3000';
const APP_NAME = 'Brace.to';
const APP_URL = 'https://brace.to';
const APP_ICON_URL = `${APP_URL}/logo192.png`;
const APP_SCOPES = ['store_write'];

const appConfig = new AppConfig(APP_SCOPES, APP_URL);
const userSession = new UserSession({ appConfig });

const doUseWithOtherApps = (walletConfig) => {
  try {
    if (walletConfig.meta && walletConfig.meta.hideWarningForReusingIdentity) {
      return false;
    }

    for (const account of walletConfig.accounts) {
      for (const k in account.apps) {
        if (k !== APP_URL) return true;
      }
    }
  } catch (e) {
    console.log(e);
  }

  return false;
};

const _doUseBefore = (account) => {
  for (const k in account.apps) {
    if (k === APP_URL) return true;
  }
  return false;
};

const doUseBefore = (walletConfig, accountIndex = null) => {
  try {
    if (accountIndex) {
      const account = walletConfig.accounts[accountIndex];
      if (_doUseBefore(account)) return true;
    } else {
      for (const account of walletConfig.accounts) {
        if (_doUseBefore(account)) return true;
      }
    }
  } catch (e) {
    console.log(e);
  }

  return false;
};

function App() {
  const [wallet, setWallet] = useState(null);
  const [walletConfig, setWalletConfig] = useState(null);
  const [gaiaConfig, setGaiaConfig] = useState(null);
  const [secretKey, setSecretKey] = useState('');
  const [secretKeyInput, setSecretKeyInput] = useState('');

  const onSignUpBtnClick = async () => {
    if (wallet) return;

    const secretKey = generateSecretKey(128);
    const w = await generateWallet({ secretKey, password: DEFAULT_PASSWORD });
    console.log('w: ', w);
    setWallet(w);

    const backupSecretKey = await decrypt(w.encryptedSecretKey, DEFAULT_PASSWORD);
    console.log('secretKey and its backup equals: ', secretKey === backupSecretKey);
    setSecretKey(backupSecretKey);
  };

  const onSignInBtnClick = async () => {
    if (wallet) {
      console.log('Wallet is already available.');
      return;
    }

    try {
      const baseWallet = await generateWallet(
        { secretKey: secretKeyInput, password: DEFAULT_PASSWORD }
      );
      const w = await restoreWalletAccounts({
        wallet: baseWallet,
        gaiaHubUrl: DEFAULT_GAIA_HUB_URL,
      });
      console.log('w: ', w);

      let didUpdate = false;
      for (const account of w.accounts) {
        if (!account.username) {
          const stxAddress = getStxAddress({
            account, transactionVersion: TransactionVersion.Mainnet,
          });
          const nameUrl = `https://stacks-node-api.mainnet.stacks.co/v1/addresses/stacks/${stxAddress}`;
          const res = await fetchPrivate(nameUrl);
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.names) && json.names.length > 0) {
              account.username = json.names[0];
              didUpdate = true;
            }
          }
        }

        const profile = await fetchAccountProfile({
          account, gaiaHubUrl: DEFAULT_GAIA_HUB_READ_URL
        });
        if (profile) account.profile = profile;
      }
      if (didUpdate) console.log('Need to update wallet config again!');

      const gConfig = await createWalletGaiaConfig({
        gaiaHubUrl: DEFAULT_GAIA_HUB_URL, wallet: w
      });
      const wConfig = await getOrCreateWalletConfig({
        wallet: w, gaiaHubConfig: gConfig, skipUpload: true,
      });

      // Check if use this wallet with other apps
      // As directly enter backup phrase, for security, don't reuse backup phrase
      if (doUseWithOtherApps(wConfig) && !doUseBefore(wConfig)) {
        console.log('WARNING: use this wallet with other apps.');
      }

      setWallet(w);
      setWalletConfig(wConfig);
      setGaiaConfig(gConfig);
      setSecretKeyInput('');
    } catch (e) {
      console.log(e);
    }
  };

  const onAppSignInBtnClick = async () => {
    if (!wallet) {
      console.log('No wallet to be used for app sign in.');
      return;
    }

    const accountIndex = 0;
    const account = wallet.accounts[accountIndex];

    /*const profileUrl = await fetchAccountProfileUrl({
      account, gaiaHubUrl: DEFAULT_GAIA_HUB_READ_URL,
    });
    const profile = await fetchProfileFromUrl(profileUrl);*/
    const profile = account.profile;

    if (!doUseBefore(walletConfig, accountIndex)) {
      await updateWalletConfigWithApp({
        wallet,
        account,
        app: {
          origin: APP_URL,
          scopes: APP_SCOPES,
          lastLoginAt: new Date().getTime(),
          appIcon: APP_ICON_URL,
          name: APP_NAME,
        },
        gaiaHubConfig: gaiaConfig,
        walletConfig,
      });
    }

    let gaiaUrl = DEFAULT_GAIA_HUB_URL;
    if (profile && profile.api && profile.api.gaiaHubUrl) {
      gaiaUrl = profile.api.gaiaHubUrl;
    }

    const publicKey = SECP256K1Client.derivePublicKey(account.dataPrivateKey);
    const address = publicKeyToAddress(publicKey);
    const did = makeDIDFromAddress(address);

    const appPrivateKey = getAppPrivateKey({ account, appDomain: APP_URL });

    const compressedAppPublicKey = getPublicKeyFromPrivate(appPrivateKey.slice(0, 64));
    const associationToken = makeGaiaAssociationToken({
      privateKey: account.dataPrivateKey,
      childPublicKeyHex: compressedAppPublicKey,
    });

    const userData = {
      username: account.username || '',
      email: null,
      profile: { ...(profile || DEFAULT_PROFILE), stxAddress: {} },
      //profile_url: profile ? profileUrl : null,
      decentralizedID: did,
      identityAddress: address,
      appPrivateKey: appPrivateKey,
      coreSessionToken: null,
      authResponseToken: null,
      hubUrl: gaiaUrl,
      coreNode: null,
      gaiaAssociationToken: associationToken,
      //version: VERSION,
      // gaiaConfig below is created with wallet private key, not app private key
      // this will be created later by @stacks/storage
      //'gaiaHubConfig': gaiaConfig,
    };
    console.log('userData: ', userData);

    const sessionData = userSession.store.getSessionData();
    sessionData.userData = userData;
    userSession.store.setSessionData(sessionData);
  };

  const onIsSignedInBtnClick = () => {
    console.log('isUserSignedIn: ', userSession.isUserSignedIn());
  };

  const onPutFileBtnClick = async () => {
    const myData = JSON.stringify({ hello: "world", num: 1 });

    const storage = new Storage({ userSession });
    const fileUrl = await storage.putFile('my_data.json', myData);
    console.log('fileUrl: ', fileUrl);
  };

  const onGetFileBtnClick = async () => {
    const storage = new Storage({ userSession });
    const fileContent = await storage.getFile('my_data.json');
    console.log(fileContent);
  };

  const onListFilesBtnClick = async () => {
    const storage = new Storage({ userSession });
    await storage.listFiles((fpath) => {
      console.log(`fpath: ${fpath}`);
      return true;
    });
  };

  const onDeleteFileBtnClick = async () => {
    const storage = new Storage({ userSession });
    await storage.deleteFile('my_data.json');
  };

  const onAppSignOutBtnClick = async () => {
    userSession.signUserOut();
  };

  const onSignOutBtnClick = async () => {
    setWallet(null);
    setSecretKey('');
  };

  const onSecretKeyInputChange = (e) => setSecretKeyInput(e.target.value);

  useEffect(() => {

  }, []);

  return (
    <div className="App">
      <div>
        <button onClick={onSignUpBtnClick}>Sign up</button>
        <p>{secretKey}</p>
      </div>
      <div>
        <input onChange={onSecretKeyInputChange} type="text" placeholder="Enter backup phrase" value={secretKeyInput} />
        <button onClick={onSignInBtnClick}>Sign in</button>
        <p></p>
      </div>
      <div>
        <button onClick={onAppSignInBtnClick}>Sign in to App</button>
        <p></p>
      </div>
      <div>
        <button onClick={onIsSignedInBtnClick}>is signed in?</button>
        <p></p>
      </div>
      <div>
        <button onClick={onPutFileBtnClick}>Put file</button>
        <p></p>
      </div>
      <div>
        <button onClick={onGetFileBtnClick}>Get file</button>
        <p></p>
      </div>
      <div>
        <button onClick={onListFilesBtnClick}>List files</button>
        <p></p>
      </div>
      <div>
        <button onClick={onDeleteFileBtnClick}>Delete file</button>
        <p></p>
      </div>
      <div>
        <button onClick={onAppSignOutBtnClick}>Sign out from App</button>
        <p></p>
      </div>
      <div>
        <button onClick={onSignOutBtnClick}>Sign out</button>
        <p></p>
      </div>
    </div>
  );
}

export default App;
