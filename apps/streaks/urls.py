from django.urls import path

from apps.streaks.views import MyCalendarView, MyStreakView

urlpatterns = [
    path("me/streak/", MyStreakView.as_view(), name="my-streak"),
    path("me/calendar/", MyCalendarView.as_view(), name="my-calendar"),
]
