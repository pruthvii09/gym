from django.urls import path

from apps.checkins.views import CheckinCreateView, MyCheckinsView

urlpatterns = [
    path("checkins/", CheckinCreateView.as_view(), name="checkin-create"),
    path("me/checkins/", MyCheckinsView.as_view(), name="checkin-list-mine"),
]
