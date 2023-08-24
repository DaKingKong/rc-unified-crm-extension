import LibPhoneNumberMatcher from './lib/LibPhoneNumberMatcher'
import RangeObserver from './lib/RangeObserver'
import App from './components/embedded';
import React from 'react';
import ReactDOM from 'react-dom';
import { RcThemeProvider } from '@ringcentral/juno';
import config from './config.json';
import packageJson from '../package.json';

console.log('import content js to web page');

async function initializeC2D() {
  const countryCode = await chrome.storage.local.get(
    { selectedRegion: 'US' }
  );

  window.clickToDialInject = new window.RingCentralC2D({
    observer: new RangeObserver({
      matcher: new LibPhoneNumberMatcher({
        countryCode: countryCode.selectedRegion
      })
    })
  });

  window.clickToDialInject.on(
    window.RingCentralC2D.events.call,
    function (phoneNumber) {
      console.log('Click To Dial:', phoneNumber);
      // alert('Click To Dial:' + phoneNumber);
      chrome.runtime.sendMessage({
        type: 'c2d',
        phoneNumber,
      });
    },
  );
  window.clickToDialInject.on(
    window.RingCentralC2D.events.text,
    function (phoneNumber) {
      console.log('Click To SMS:', phoneNumber);
      // alert('Click To SMS:' + phoneNumber);
      chrome.runtime.sendMessage({
        type: 'c2sms',
        phoneNumber,
      });
    },
  );
}
initializeC2D();

// Listen message from background.js to open app window when user click icon.
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    if (request.action === 'openAppWindow') {
      console.log('opening window');
      // set app window minimized to false
      window.postMessage({
        type: 'rc-adapter-syncMinimized',
        minimized: false,
      }, '*');
      //sync to widget
      document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-syncMinimized',
        minimized: false,
      }, '*');
    }
    if (request.action === 'needCallbackUri') {
      chrome.runtime.sendMessage({
        type: 'pipedriveCallbackUri',
        callbackUri: window.location.href
      });
    }
    if (request.action === 'pipedriveAltAuthDone') {

      console.log('pipedriveAltAuthDone')
      const rcStepper = window.document.querySelector('#rc-stepper');
      rcStepper.innerHTML = '(3/3) Setup finished. You can close this page now.';
    }
    sendResponse('ok');
  }
);

const delay = ms => new Promise(res => setTimeout(res, ms));
function Root() {
  return (
    <RcThemeProvider>
      <App />
    </RcThemeProvider>
  );
}

async function RenderQuickAccessButton() {
  const { quickAccessButtonOn } = await chrome.storage.local.get(
    { quickAccessButtonOn: 'ON' }
  );
  if (!window.location.hostname.includes('ringcentral.') && quickAccessButtonOn === 'ON') {
    if (window.location.hostname.includes('pipedrive')) {
      await delay(1000); // to prevent react hydration error on Pipedrive
    }
    const rootElement = window.document.createElement('div');
    window.document.body.appendChild(rootElement);
    ReactDOM.render(<Root />, rootElement);
  }
}

// RenderQuickAccessButton();

async function RenderExtension() {
  const queryString = `?multipleTabsSupport=1&disableLoginPopup=1&appServer=${config.rcServer}&redirectUri=${config.redirectUri}&enableAnalytics=1&showSignUpButton=1&clientId=${config.clientId}&appVersion=${packageJson.version}&userAgent=RingCentral CRM Extension`;
  const rcs = document.createElement('script');
  rcs.src = chrome.runtime.getURL('embeddable/adapter.js') + queryString;
  const rcs0 = document.getElementsByTagName('script')[0]
  rcs0.parentNode.insertBefore(rcs, rcs0)
}

RenderExtension();

if (window.location.pathname === '/pipedrive-redirect') {
  chrome.runtime.sendMessage({ type: "openPopupWindowOnPipedriveDirectPage", platform: 'pipedrive', hostname: 'temp' });
  const rcStepper = window.document.querySelector('#rc-stepper');
  rcStepper.innerHTML = '(2/3) Please sign in on the extension with your RingCentral account.';
}

if (document.readyState !== 'loading') {
  registerInsightlyApiKey();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    registerInsightlyApiKey();
  });
}

function registerInsightlyApiKey() {
  if (window.location.pathname === '/Users/UserSettings' && window.location.hostname.includes('insightly.com')) {
    const insightlyApiKey = document.querySelector('#apikey').innerHTML;
    const insightlyApiUrl = document.querySelector('#apiUrl').firstChild.innerHTML;
    chrome.runtime.sendMessage({
      type: 'insightlyAuth',
      apiKey: insightlyApiKey,
      apiUrl: insightlyApiUrl
    });
  }
}