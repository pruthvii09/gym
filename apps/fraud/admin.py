from django.contrib import admin, messages
from rest_framework.exceptions import ValidationError

from apps.fraud import services as fraud_services
from apps.fraud.models import FraudEvent, FraudReview


@admin.register(FraudEvent)
class FraudEventAdmin(admin.ModelAdmin):
    list_display = ("user", "event_type", "checkin", "review", "created_at")
    list_filter = ("event_type",)
    search_fields = ("user__email", "details")
    readonly_fields = [f.name for f in FraudEvent._meta.fields]
    actions = ["create_review_from_events"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.action(description="Create fraud review from selected events")
    def create_review_from_events(self, request, queryset):
        try:
            review = fraud_services.create_review_from_events(actor=request.user, events=queryset)
        except ValidationError as exc:
            self.message_user(request, str(exc.detail[0]), level=messages.ERROR)
            return
        self.message_user(request, f"Linked {queryset.count()} event(s) to review {review.id}.")


@admin.register(FraudReview)
class FraudReviewAdmin(admin.ModelAdmin):
    list_display = ("user", "risk_level", "status", "resolved_by", "resolved_at", "created_at")
    list_filter = ("status", "risk_level")
    search_fields = ("user__email", "reason")
    readonly_fields = (
        "id",
        "user",
        "risk_level",
        "reason",
        "resolved_at",
        "resolved_by",
        "created_at",
        "updated_at",
    )
    actions = ["approve_selected", "reject_selected"]

    def save_model(self, request, obj, form, change):
        if (
            change
            and "status" in form.changed_data
            and obj.status in (FraudReview.Status.APPROVED, FraudReview.Status.REJECTED)
        ):
            # Reload the pre-edit row so the service (which reads
            # review.status to validate the transition) sees the OLD status,
            # not the new one the ModelForm already stamped onto `obj`.
            current = FraudReview.objects.get(pk=obj.pk)
            fraud_services.resolve_review(
                actor=request.user,
                review=current,
                new_status=obj.status,
                resolution_notes=obj.resolution_notes,
            )
            return
        super().save_model(request, obj, form, change)

    @admin.action(description="Approve selected reviews (confirm fraud concern)")
    def approve_selected(self, request, queryset):
        count = 0
        for review in queryset.filter(status=FraudReview.Status.OPEN):
            fraud_services.resolve_review(
                actor=request.user, review=review, new_status=FraudReview.Status.APPROVED
            )
            count += 1
        self.message_user(request, f"Approved {count} review(s).")

    @admin.action(description="Reject selected reviews (dismiss as false positive)")
    def reject_selected(self, request, queryset):
        count = 0
        for review in queryset.filter(status=FraudReview.Status.OPEN):
            fraud_services.resolve_review(
                actor=request.user, review=review, new_status=FraudReview.Status.REJECTED
            )
            count += 1
        self.message_user(request, f"Rejected {count} review(s).")
