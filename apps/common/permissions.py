from rest_framework.permissions import BasePermission


class IsStaffUser(BasePermission):
    """Gate for every admin/operations API in the project.

    Reuses the existing `User.is_staff` flag (the same one Django admin
    itself checks) rather than introducing a parallel "is admin" concept --
    one authorization bit for one meaning, checked in one place.
    """

    message = "You do not have permission to access this admin resource."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.is_staff
        )
