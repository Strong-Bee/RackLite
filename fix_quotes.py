with open('components/store/StoreClient.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the double quotes with HTML entity "
content = content.replace('klik "Instal" ulang', 'klik "Instal" ulang')

with open('components/store/StoreClient.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')