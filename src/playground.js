import {
  generateWallet, getAppPrivateKey
} from '@stacks/wallet-sdk';
import {
  getPublicKeyFromPrivate, publicKeyToBtcAddress, signECDSA,
} from '@stacks/encryption';
import { getAddressFromPrivateKey } from '@stacks/transactions';

const DEFAULT_PASSWORD = 'password';

const play = async () => {
  const secretKey = '';
  const wallet = await generateWallet({ secretKey, password: DEFAULT_PASSWORD });
  const account = wallet.accounts[0];

  const domainName = '';

  const appPrivKey = getAppPrivateKey({ account, appDomain: domainName });
  if (appPrivKey.length !== 64) {
    throw new Error('Wrong! Need to slice(0, 64)?');
  }

  const appPubKey = getPublicKeyFromPrivate(appPrivKey);
  const appBtcAddr = publicKeyToBtcAddress(appPubKey);
  const appStxAddr = getAddressFromPrivateKey(appPrivKey, 'mainnet');
  console.log('appPubKey', appPubKey);
  console.log('appBtcAddr', appBtcAddr);
  console.log('appStxAddr', appStxAddr);

  const sigObj = signECDSA(appPrivKey, '');
  console.log('appPubKey', sigObj.publicKey);
  console.log('appSigStr', sigObj.signature);
};
play();
