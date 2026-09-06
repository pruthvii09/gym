import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_backfill_usernames'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='username',
            field=models.CharField(max_length=30, unique=True, validators=[django.core.validators.RegexValidator(message='Usernames can only contain lowercase letters, numbers, and underscores (3-30 characters).', regex='^[a-z0-9_]{3,30}$')]),
        ),
    ]
