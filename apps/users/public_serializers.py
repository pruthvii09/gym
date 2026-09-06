from rest_framework import serializers

from apps.badges.serializers import UserBadgeSerializer
from apps.users.models import User


class UserSearchResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("username", "first_name", "last_name")
        read_only_fields = fields


class PublicProfileSerializer(serializers.ModelSerializer):
    """The public-facing shape of a user -- deliberately its own serializer,
    not UserSerializer with some fields dropped: a field added to the
    private one (email, phone, is_staff, ...) must never leak here just by
    existing on the model, so this only ever grows by someone explicitly
    adding a field to this class.
    """

    gym_name = serializers.SerializerMethodField()
    current_streak = serializers.SerializerMethodField()
    longest_streak = serializers.SerializerMethodField()
    featured_badges = serializers.SerializerMethodField()
    total_badge_count = serializers.SerializerMethodField()
    joined_at = serializers.DateTimeField(source="created_at", read_only=True)
    follower_count = serializers.SerializerMethodField()
    following_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "username",
            "first_name",
            "last_name",
            "joined_at",
            "gym_name",
            "current_streak",
            "longest_streak",
            "featured_badges",
            "total_badge_count",
            "follower_count",
            "following_count",
            "is_following",
        )
        read_only_fields = fields

    def get_gym_name(self, obj):
        from apps.users.services import member_gym_summary

        summary = member_gym_summary(obj)
        return summary["name"] if summary else None

    def get_current_streak(self, obj):
        from apps.streaks.models import UserStreak

        streak = UserStreak.objects.filter(user=obj).first()
        return streak.current_streak if streak else 0

    def get_longest_streak(self, obj):
        from apps.streaks.models import UserStreak

        streak = UserStreak.objects.filter(user=obj).first()
        return streak.longest_streak if streak else 0

    def get_featured_badges(self, obj):
        from apps.badges.services import featured_badges_for

        return UserBadgeSerializer(featured_badges_for(obj), many=True).data

    def get_total_badge_count(self, obj):
        from apps.badges.services import total_badge_count

        return total_badge_count(obj)

    def get_follower_count(self, obj):
        from apps.social.services import follower_count

        return follower_count(obj)

    def get_following_count(self, obj):
        from apps.social.services import following_count

        return following_count(obj)

    def get_is_following(self, obj):
        from apps.social.services import is_following

        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        return is_following(request.user, obj)
