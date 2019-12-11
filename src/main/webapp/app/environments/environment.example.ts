export const environment = {
    firebaseConfig: {
        apiKey: "[API-KEY]",
        authDomain: "[PROJECT-ID].firebaseapp.com",
        databaseURL: "https://[PROJECT-ID].firebaseio.com",
        projectId: "[PROJECT-ID]",
        storageBucket: "[PROJECT-ID].appspot.com",
        messagingSenderId: "[SENDER-ID]",
    },
    devEmail: '', // set development team email to receive error notifications
    oncotreeVersion: '', // set for using specific oncotree version. By default, it is "oncotree_latest_stable".
    frontEndOnly: true, // set to true if doing frontend development
    isPermitted: true, // set to false for building read-only website
    mmApiAddress: 'https://matchminer_api_address.org/api', //matchminer API IP. null value hides Import buttons
    apiToken: 'Basic 123456789', //matchminer API token auth
    demo: false, // turning on disables login function
};
