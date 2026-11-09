// Firebase 웹 앱 설정 (공개용 설정값이에요. 보안은 firestore.rules가 지켜요.)
window.WAE_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDlF1pcVvJgvw0F22iQ7H_QzO8ZQATM5Ao',
    authDomain: 'waettuen-quiz.firebaseapp.com',
    projectId: 'waettuen-quiz',
    storageBucket: 'waettuen-quiz.firebasestorage.app',
    messagingSenderId: '483681970509',
    appId: '1:483681970509:web:4d5394fcf02ead1d6fef04'
  },
  // 이벤트 안내 (on: true 로 바꾸면 화면에 보여요)
  event: {
    on: false,
    title: '주간 1등 선물 이벤트',
    prize: '커피 기프티콘',
    youtube: 'https://www.youtube.com/results?search_query=%EC%99%9C%EB%9C%AC%EA%B2%A8'
  }
};
