"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig =
  process.env.NEXT_PUBLIC_FIREBASE_ENV === "production"
    ? {
        apiKey: "AIzaSyAx2lD9DX1WckfziLS6n_ZqU_U2FBx-0Ck",
        authDomain: "tangbuy-master.firebaseapp.com",
        projectId: "tangbuy-master",
        storageBucket: "tangbuy-master.firebasestorage.app",
        messagingSenderId: "1066949576439",
        appId: "1:1066949576439:web:77ff26ddaedae8ae82b5f2",
      }
    : {
        apiKey: "AIzaSyAeAaRHq3tT-GAddI9L4Ig84g9ZRM2--ao",
        authDomain: "tangbuy-test.firebaseapp.com",
        projectId: "tangbuy-test",
        storageBucket: "tangbuy-test.firebasestorage.app",
        messagingSenderId: "820282471191",
        appId: "1:820282471191:web:58d0c6bf84414dee27bd52",
      };

export async function signInWithGoogle() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");

  const result = await signInWithPopup(getAuth(app), provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const profile = result.user.providerData[0] ?? result.user;

  return {
    accessToken: credential?.accessToken,
    email: profile.email,
    openId: profile.uid,
    avatar: profile.photoURL,
    userName: profile.displayName,
    platform: "GOOGLE",
    device: "pc",
  };
}

export async function signInWithApple(locale = "en") {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  provider.setCustomParameters({
    locale: locale.startsWith("zh") ? "zh" : locale.startsWith("es") ? "es" : "en",
  });

  const result = await signInWithPopup(getAuth(app), provider);
  const credential = OAuthProvider.credentialFromResult(result);
  const profile = result.user.providerData[0] ?? result.user;

  return {
    accessToken: credential?.idToken,
    email: profile.email,
    openId: profile.uid,
    avatar: profile.photoURL,
    userName: profile.displayName ?? result.user.displayName,
    platform: "APPLE",
    device: "pc",
  };
}
