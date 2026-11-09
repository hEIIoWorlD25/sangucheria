
pipeline {
    agent any

    tools {
        nodejs 'Node24'
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 15, unit: 'MINUTES')
        timestamps()
    }

    stages {

        stage('Verificar entorno') {
            steps {
                echo 'Verificando Node.js y npm'
                sh 'node --version'
                sh 'npm --version'
            }
        }

        stage('Instalar dependencias') {
            steps {
                echo 'Instalando dependencias del proyecto'
                sh 'npm ci'
            }
        }

        stage('Revisar sintaxis') {
            steps {
                echo 'Validando archivos de la aplicacion'
                sh 'npm run check'
            }
        }

        stage('Compilar Tailwind CSS') {
            steps {
                echo 'Generando estilos de produccion'
                sh 'npm run build:css'
                sh 'test -s public/styles.css'
            }
        }

        stage('Pruebas PC11 y PC12') {
            steps {
                echo 'Ejecutando las 24 pruebas automatizadas'
                sh 'npm run test:ci'
            }
        }
    }

    post {
        always {
            echo 'Publicando resultados y evidencias'

            archiveArtifacts(
                artifacts: 'reports/junit.xml,public/styles.css',
                allowEmptyArchive: true
            )

            script {
                if (fileExists('reports/junit.xml')) {
                    junit(
                        testResults: 'reports/junit.xml',
                        allowEmptyResults: false
                    )
                } else {
                    echo 'No se genero el reporte JUnit. Revisar la consola.'
                }
            }
        }

        success {
            echo 'Pipeline completado correctamente.'
        }

        failure {
            echo 'Se detectaron errores. Revisar Console Output.'
        }
    }
}
