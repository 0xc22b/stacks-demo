import React, { useState, useEffect, useRef } from 'react';
import { UserSession, AppConfig } from 'blockstack';
import { showConnect } from '@stacks/connect';

import './App.css';

const randInt = (max) => {
  return Math.floor(Math.random() * Math.floor(max));
};

const randomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const charactersLength = characters.length;

  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

function App() {

  const [signInMsg, setSignInMsg] = useState('Not signed in.');
  const userSession = useRef(null);

  const onSignInBtnClick = () => {
    const authOptions = {
      redirectTo: '/',
      appDetails: {
        name: 'Stacks demo',
        icon: window.location.href + '/logo192.png',
      },
      onFinish: () => {
        setSignInMsg('Signed in.');
      },
      sendToSignIn: false,
      userSession: userSession.current,
    };
    showConnect(authOptions);
  };

  const onPutFileBtnClick = () => {
    const fpath = randomString(randInt(10)) + '.txt';
    const content = 'This is a test.';
    userSession.current.putFile(fpath, content);
  }

  const onDeleteAllBtnClick = async () => {
    const fpaths = [];
    await userSession.current.listFiles(fpath => {
      fpaths.push(fpath)
      return true;
    });

    for (const fpath of fpaths) userSession.current.deleteFile(fpath);
  }

  useEffect(() => {
    const appConfig = new AppConfig(['store_write'], window.location.href);
    userSession.current = new UserSession({ appConfig: appConfig });
  }, []);

  return (
    <div className="App">
      <div>
        <button onClick={onSignInBtnClick}>Sign in</button>
        <p>{signInMsg}</p>
      </div>
      <div>
        <button onClick={onPutFileBtnClick}>Put arbitrary file</button>
        <button onClick={onDeleteAllBtnClick}>Delete all</button>
      </div>
    </div>
  );
}

export default App;
