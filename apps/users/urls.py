from django.urls import path

from apps.users.views import (
    ForgotPasswordView,
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView,
    ResetPasswordView,
    SendEmailVerificationView,
    VerifyEmailView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("email/send-verification/", SendEmailVerificationView.as_view(), name="email-send-verification"),
    path("email/verify/", VerifyEmailView.as_view(), name="email-verify"),
    path("password/forgot/", ForgotPasswordView.as_view(), name="password-forgot"),
    path("password/reset/", ResetPasswordView.as_view(), name="password-reset"),
]
