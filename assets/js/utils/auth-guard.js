import {
    getValidUserSession,
    getUserProfile,
    logoutUser
} from "../services/auth-service.js";

export async function protectPage(requiredRole) {

    try {
        // Step 1: Get a valid session
        const session = await getValidUserSession();

        if (!session) {
            window.location.href = "../login.html";
            return null;
        }

        // Step 2: Retrieve user profile
        const profile = await getUserProfile(
            session.uid,
            session.idToken
        );

        // Step 3: Check account status
        if (!profile.isActive) {
            throw new Error("Your account is inactive.");
        }

        // Step 4: Check user role
        if (profile.role !== requiredRole) {
            throw new Error("You are not authorized to access this page.");
        }

        return profile;

    } catch (error) {
        logoutUser();
        alert(error.message);
        window.location.href = "../login.html";
        return null;
    }
}