import {
    firebaseConfig,
    FIREBASE_AUTH_URL,
    FIRESTORE_URL
} from "../firebase/firebase-config.js";

const API_KEY = firebaseConfig.apiKey;

export async function registerUser(email, password) {
    const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:signUp?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                password: password,
                returnSecureToken: true
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error.message);
    }

    return data;
}

export async function loginUser(email, password) {
    const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                password: password,
                returnSecureToken: true
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error.message);
    }

    return data;
}

export async function createUserProfile(uid, idToken, name, email, mobile) {

    const response = await fetch(
        `${FIRESTORE_URL}/users?documentId=${uid}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({
                fields: {
                    name: { stringValue: name },
                    email: { stringValue: email },
                    mobile: { stringValue: mobile },
                    role: { stringValue: "customer" },
                    creditLimit: { integerValue: "0" },
                    creditUsed: { integerValue: "0" },
                    isActive: { booleanValue: true },
                    createdAt: { timestampValue: new Date().toISOString() },
                    updatedAt: { timestampValue: new Date().toISOString() }
                }
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error.message);
    }

    return data;
}

export async function resetPassword(email) {
    const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:sendOobCode?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                requestType: "PASSWORD_RESET",
                email: email
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error.message);
    }

    return data;
}

export async function sendVerificationEmail(idToken) {
    const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:sendOobCode?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                requestType: "VERIFY_EMAIL",
                idToken: idToken
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error.message);
    }

    return data;
}

export async function checkEmailVerification(idToken) {
    const response = await fetch(
        `${FIREBASE_AUTH_URL}/accounts:lookup?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                idToken: idToken
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error.message);
    }

    return data.users[0].emailVerified;
}

export function getUserSession() {
    const session = sessionStorage.getItem("userSession");

    return session ? JSON.parse(session) : null;
}

export function logoutUser() {
    sessionStorage.removeItem("userSession");
}

export async function refreshUserSession() {
    const session = getUserSession();

    if (!session) {
        throw new Error("No active user session.");
    }

    const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: session.refreshToken
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        logoutUser();
        throw new Error(data.error.message);
    }

    const updatedSession = {
        uid: data.user_id,
        email: session.email,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + Number(data.expires_in) * 1000
    };

    sessionStorage.setItem("userSession", JSON.stringify(updatedSession));

    return updatedSession;
}

export async function getValidUserSession() {
    const session = getUserSession();

    if (!session) {
        return null;
    }

    // Refresh if token expires within the next 5 minutes
    if (
        !session.expiresAt ||
        session.expiresAt <= Date.now() + 5 * 60 * 1000
    ) {
        return await refreshUserSession();
    }

    return session;
}

export async function registerCustomer(name, email, password, mobile) {

    // Step 1: Create Firebase Authentication account
    const authData = await registerUser(email, password);

    // Step 2: Create Firestore user profile
    await createUserProfile(
        authData.localId,
        authData.idToken,
        name,
        email,
        mobile
    );

    // Step 3: Send email verification
    await sendVerificationEmail(authData.idToken);

    return {
        uid: authData.localId,
        email: authData.email,
        message: "Registration successful. Please verify your email."
    };
}

export async function loginCustomer(email, password) {

    // Step 1: Authenticate user
    const authData = await loginUser(email, password);

    // Step 2: Check email verification
    const isVerified = await checkEmailVerification(
        authData.idToken
    );

    if (!isVerified) {
        throw new Error(
            "Please verify your email before logging in."
        );
    }

    // Step 3: Retrieve Firestore profile
    const profile = await getUserProfile(
        authData.localId,
        authData.idToken
    );

    // Step 4: Check account status
    if (!profile.isActive) {
        throw new Error(
            "Your account is inactive. Contact the administrator."
        );
    }

    // Step 5: Save session
    saveUserSession(authData);

    return {
        ...profile,
        message: "Login successful."
    };
}

export async function getUserProfile(uid, idToken) {

    const response = await fetch(
        `${FIRESTORE_URL}/users/${uid}`,
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${idToken}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Unable to retrieve user profile."
        );
    }

    const fields = data.fields;

    return {
        uid: data.name.split("/").pop(),
        name: fields.name.stringValue,
        email: fields.email.stringValue,
        mobile: fields.mobile.stringValue,
        role: fields.role.stringValue,
        creditLimit: Number(fields.creditLimit.integerValue),
        creditUsed: Number(fields.creditUsed.integerValue),
        isActive: fields.isActive.booleanValue
    };
}

export function saveUserSession(authData) {
    const session = {
        uid: authData.localId,
        email: authData.email,
        idToken: authData.idToken,
        refreshToken: authData.refreshToken,
        expiresAt: Date.now() + Number(authData.expiresIn) * 1000
    };

    sessionStorage.setItem("userSession", JSON.stringify(session));
}

export function handleLogout(redirectPath = "../../index.html") {
    logoutUser();
    window.location.href = redirectPath;
}