package com.lifeos.web;

/** Thrown anywhere in the app to send a clean JSON error: {"error": "..."} */
public class ApiException extends RuntimeException {
    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int status() {
        return status;
    }

    public static ApiException bad(String message) { return new ApiException(400, message); }
    public static ApiException notFound() { return new ApiException(404, "Not found."); }
}
