import React, { useState, useEffect } from 'react';

import {
  DEFAULT_PROFILE, makeDIDFromAddress, UserSession, AppConfig,
} from '@stacks/auth'
import { Storage } from '@stacks/storage';
import keychain, { decrypt } from '@stacks/keychain';
import { makeGaiaAssociationToken } from '@stacks/keychain/dist/utils/gaia';
import { ChainID } from '@stacks/transactions';
import { getPublicKeyFromPrivate } from '@stacks/encryption';
import { BLOCKSTACK_DEFAULT_GAIA_HUB_URL, Buffer } from '@stacks/common';

import './App.css';

const DEFAULT_PASSWORD = 'password';

//const APP_NAME = 'Stacks demo';
//const APP_URL = 'https://192.168.1.43:3000';
const APP_NAME = 'Brace.to';
const APP_URL = 'https://brace.to';
const APP_ICON_URL = `${APP_URL}/logo192.png`;
const APP_SCOPES = ['store_write'];

const appConfig = new AppConfig(APP_SCOPES, APP_URL);
const userSession = new UserSession({ appConfig });

const doUseWithOtherApps = (wallet) => {
  try {
    if (wallet.walletConfig && !wallet.walletConfig.hideWarningForReusingIdentity) {
      for (const identity of wallet.walletConfig.identities) {
        for (const k in identity.apps) {
          if (k !== APP_URL) return true;
        }
      }
    }
  } catch (e) {
    console.log(e);
  }

  return false;
};

const _doUseBefore = (identity) => {
  for (const k in identity.apps) {
    if (k === APP_URL) return true;
  }
  return false;
};

const doUseBefore = (wallet, identityIndex = null) => {
  try {
    if (wallet.walletConfig) {
      if (identityIndex) {
        const identity = wallet.walletConfig.identities[identityIndex];
        if (_doUseBefore(identity)) return true;
      } else {
        for (const identity of wallet.walletConfig.identities) {
          if (_doUseBefore(identity)) return true;
        }
      }
    }
  } catch (e) {
    console.log(e);
  }

  return false;
};

function App() {
  const [wallet, setWallet] = useState(null);
  const [backupPhrase, setBackupPhrase] = useState('');
  const [backupPhraseInput, setBackupPhraseInput] = useState('');

  const onSignUpBtnClick = async () => {
    if (wallet) return;

    const w = await keychain.Wallet.generate(DEFAULT_PASSWORD, ChainID.Mainnet);
    setWallet(w);

    const encryptedBackupPhrase = wallet.encryptedBackupPhrase;
    const plainTextBuffer = await decrypt(Buffer.from(encryptedBackupPhrase, 'hex'), DEFAULT_PASSWORD);
    const phrase = plainTextBuffer.toString();
    setBackupPhrase(phrase);
  };

  const onSignInBtnClick = async () => {
    if (wallet) return;

    try {
      const w = await keychain.Wallet.restore(DEFAULT_PASSWORD, backupPhraseInput, ChainID.Mainnet);

      // Check if use this wallet with other apps
      // As directly enter backup phrase, for security, don't reuse backup phrase
      if (doUseWithOtherApps(w) && !doUseBefore(w)) {
        console.log('WARNING: use this wallet with other apps.');
      }

      setWallet(w);
      setBackupPhraseInput('');
    } catch (e) {
      console.log(e);
    }
  };

  const onAppSignInBtnClick = async () => {
    const identityIndex = 0;
    const currentIdentity = wallet.identities[identityIndex];
    await currentIdentity.refresh();

    // Use wallet-config.json in hub.blockstack.org to restore a wallet for convenience
    // ref: @stacks/keychain/src/wallet:restore
    if (!doUseBefore(wallet, identityIndex)) {
      const gaiaConfig = await wallet.createGaiaConfig(BLOCKSTACK_DEFAULT_GAIA_HUB_URL);
      await wallet.getOrCreateConfig({ gaiaConfig, skipUpload: true });
      await wallet.updateConfigWithAuth({
        identityIndex,
        gaiaConfig,
        app: {
          origin: APP_URL,
          lastLoginAt: new Date().getTime(),
          scopes: APP_SCOPES,
          appIcon: APP_ICON_URL,
          name: APP_NAME,
        },
      });
    }

    let gaiaUrl = BLOCKSTACK_DEFAULT_GAIA_HUB_URL;
    if (currentIdentity.profile && currentIdentity.profile.api && currentIdentity.profile.api.gaiaHubUrl) {
      gaiaUrl = currentIdentity.profile.api.gaiaHubUrl;
    }

    const address = currentIdentity.keyPair.address;
    const did = makeDIDFromAddress(address);

    //const _publicKey = SECP256K1Client.derivePublicKey(currentIdentity.keyPair.key);
    //const _address = publicKeyToAddress(_publicKey);
    //console.log('address: ', address, '_address: ', _address);

    /*const stxAddress = wallet.stacksPrivateKey
      ? wallet.getSigner().getSTXAddress(TransactionVersion.Mainnet)
      : undefined;*/
    const stxAddress = '';
    const appPrivateKey = currentIdentity.appPrivateKey(APP_URL);

    //const hubInfo = await getHubInfo(gaiaUrl);
    //const profileUrl = await currentIdentity.profileUrl(hubInfo.read_url_prefix);
    //const profile = (await fetchProfile({ identity: currentIdentity, gaiaUrl: hubInfo.read_url_prefix })) || DEFAULT_PROFILE;

    const compressedAppPublicKey = getPublicKeyFromPrivate(appPrivateKey.slice(0, 64));
    const associationToken = makeGaiaAssociationToken(currentIdentity.keyPair.key, compressedAppPublicKey);

    const userData = {
      'username': currentIdentity.defaultUsername || '',
      'profile': { ...(currentIdentity.profile || DEFAULT_PROFILE), stxAddress },
      'email': null,
      'decentralizedID': did,
      'identityAddress': address,
      'appPrivateKey': appPrivateKey,
      'coreSessionToken': null,
      'authResponseToken': null,
      'hubUrl': gaiaUrl,
      'coreNode': null,
      'gaiaAssociationToken': associationToken,
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
    setBackupPhrase('');
  };

  const onBackupPhraseInputChange = (e) => setBackupPhraseInput(e.target.value);

  useEffect(() => {

  }, []);

  return (
    <div className="App">
      <div>
        <button onClick={onSignUpBtnClick}>Sign up</button>
        <p>{backupPhrase}</p>
      </div>
      <div>
        <input onChange={onBackupPhraseInputChange} type="text" placeholder="Enter backup phrase" value={backupPhraseInput} />
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
